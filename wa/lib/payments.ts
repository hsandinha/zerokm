// Assinatura pela IA — mesmo Mercado Pago da zerokm. O external_reference usa
// o formato que o webhook da zerokm espera (`firebaseUid:planId:billingType`)
// e o notification_url aponta para o webhook DA ZEROKM: a ativação do plano
// (promover para `cliente`, gravar subscription) continua centralizada lá.

import dbConnect from "@/lib/mongodb";
import { mpPost, createPreference } from "@wa/lib/mercadopago";
import Plan, { type IPlan } from "@/models/Plan";
import User, { type IUser } from "@/models/User";
import Payment from "@/models/Payment";

const ZEROKM_BASE_URL = () => process.env.ZEROKM_BASE_URL || "https://www.cnv0km.com.br";

export async function getActivePlans(): Promise<IPlan[]> {
  await dbConnect();
  return Plan.find({ active: true, type: "monthly" }).sort({ price: 1 });
}

function priceFor(plan: IPlan, billing: "monthly" | "annual"): number {
  if (billing === "annual" && typeof plan.annualPrice === "number" && plan.annualPrice > 0) {
    return plan.annualPrice; // valor TOTAL anual
  }
  return plan.price;
}

type LoadedPlanUser =
  | { ok: false; error: string }
  | { ok: true; plan: IPlan; user: IUser };

async function loadPlanAndUser(planId: string, firebaseUid: string): Promise<LoadedPlanUser> {
  await dbConnect();
  const plan = await Plan.findById(planId);
  if (!plan || !plan.active) return { ok: false, error: "Plano não encontrado ou inativo" };
  const user = await User.findOne({ firebaseUid });
  if (!user) return { ok: false, error: "Usuário não encontrado — faça o cadastro primeiro" };
  return { ok: true, plan, user };
}

function payerFor(user: IUser) {
  const doc = (user.cpf || "").replace(/\D/g, "");
  const fullName = (user.displayName || "").trim();
  const [firstName, ...rest] = fullName.split(/\s+/);
  return {
    email: user.email,
    ...(firstName ? { first_name: firstName } : {}),
    ...(rest.length > 0 ? { last_name: rest.join(" ") } : {}),
    ...(doc.length === 11 ? { identification: { type: "CPF", number: doc } } : {}),
    ...(doc.length === 14 ? { identification: { type: "CNPJ", number: doc } } : {}),
  };
}

export type PixResult =
  | { ok: true; qrCode: string; ticketUrl: string | null; amount: number; paymentId: string }
  | { ok: false; error: string };

/** PIX direto — devolve o copia-e-cola para a IA mandar no WhatsApp. */
export async function createPixPayment(params: {
  planId: string;
  firebaseUid: string;
  billing: "monthly" | "annual";
}): Promise<PixResult> {
  const loaded = await loadPlanAndUser(params.planId, params.firebaseUid);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { plan, user } = loaded;

  const amount = priceFor(plan, params.billing);
  const billingLabel = params.billing === "annual" ? "Anual" : "Mensal";
  const externalRef = `${params.firebaseUid}:${plan._id.toString()}:${params.billing}`;

  const res = await mpPost("/v1/payments", {
    transaction_amount: amount,
    description: `${plan.name} (${billingLabel}) — PIX`,
    payment_method_id: "pix",
    payer: payerFor(user),
    external_reference: externalRef,
    notification_url: `${ZEROKM_BASE_URL()}/api/webhooks/mercadopago`,
    statement_descriptor: "CNV",
    metadata: {
      userId: user._id.toString(),
      planId: plan._id.toString(),
      type: "pix-whatsapp",
      billing_type: params.billing,
    },
  });

  if (!res.ok) {
    console.error("[payments] PIX falhou:", JSON.stringify(res.data));
    return { ok: false, error: res.data?.message || "Erro ao gerar o PIX" };
  }

  const tx = res.data?.point_of_interaction?.transaction_data;
  if (!tx?.qr_code) return { ok: false, error: "Mercado Pago não devolveu o QR Code" };

  await Payment.create({
    userId: user._id,
    planId: plan._id,
    mpPaymentId: res.data.id?.toString(),
    externalReference: externalRef,
    method: "pix",
    status: "pending",
    amount,
    currency: "BRL",
    billingType: params.billing,
    payerEmail: user.email,
    payerName: user.displayName,
  }).catch((err) => console.error("[payments] Payment pendente não registrado:", err));

  return {
    ok: true,
    qrCode: tx.qr_code as string,
    ticketUrl: (tx.ticket_url as string) || null,
    amount,
    paymentId: res.data.id?.toString(),
  };
}

export type LinkResult =
  | { ok: true; url: string; amount: number }
  | { ok: false; error: string };

/** Checkout Pro — link com todos os métodos (cartão até 12x, PIX, boleto). */
export async function createPaymentLink(params: {
  planId: string;
  firebaseUid: string;
  billing: "monthly" | "annual";
}): Promise<LinkResult> {
  const loaded = await loadPlanAndUser(params.planId, params.firebaseUid);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { plan, user } = loaded;

  const amount = priceFor(plan, params.billing);
  const billingLabel = params.billing === "annual" ? "Anual" : "Mensal";
  const externalRef = `${params.firebaseUid}:${plan._id.toString()}:${params.billing}`;
  const base = ZEROKM_BASE_URL();

  const res = await createPreference({
    items: [
      {
        id: plan._id.toString(),
        title: `${plan.name} — Plano ${billingLabel}`,
        description: plan.description || plan.name,
        quantity: 1,
        currency_id: "BRL",
        unit_price: amount,
        category_id: "services",
      },
    ],
    payer: {
      email: user.email,
      ...(user.displayName ? { name: user.displayName } : {}),
      ...(user.cpf && user.cpf.replace(/\D/g, "").length === 11
        ? { identification: { type: "CPF", number: user.cpf.replace(/\D/g, "") } }
        : {}),
    },
    payment_methods: { installments: 12 },
    back_urls: {
      success: `${base}/dashboard/cliente?payment=success`,
      failure: `${base}/dashboard/cliente?payment=failure`,
      pending: `${base}/dashboard/cliente?payment=pending`,
    },
    auto_return: "approved",
    external_reference: externalRef,
    notification_url: `${base}/api/webhooks/mercadopago`,
    statement_descriptor: "CNV",
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  if (!res.ok) {
    console.error("[payments] preferência falhou:", JSON.stringify(res.data));
    return { ok: false, error: "Erro ao criar o link de pagamento" };
  }

  await Payment.create({
    userId: user._id,
    planId: plan._id,
    mpPreferenceId: res.data.id,
    externalReference: externalRef,
    method: "pending",
    status: "pending",
    amount,
    currency: "BRL",
    billingType: params.billing,
    payerEmail: user.email,
    payerName: user.displayName,
  }).catch((err) => console.error("[payments] Payment pendente não registrado:", err));

  return { ok: true, url: res.data.init_point as string, amount };
}
