// PIX da assinatura do atendimento (gestor da loja). A ativação acontece no
// webhook do Mercado Pago (referência ATEND:), igual ao plano de repasse.

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { mpPost } from "@/lib/mercadopago";
import Plan from "@/models/Plan";
import User from "@/models/User";
import Concessionaria from "@/models/Concessionaria";
import { isPlanoAtendimento, precoPlano } from "@/lib/utils/planoRepasse";
import { validateCNPJ, validateCPF } from "@/lib/utils/cpf";
import { requireScopeAdmin } from "@wa/lib/scope";
import { getStore } from "@wa/lib/store";
import { referenciaAtendimento } from "@wa/lib/assinatura-atendimento";
import { siteUrl } from "@wa/lib/site-url";

export async function POST(req: NextRequest) {
  let tenantId: string | null;
  let email: string;
  try {
    ({ tenantId, email } = await requireScopeAdmin());
  } catch {
    return NextResponse.json({ error: "Só o gestor da loja contrata o atendimento" }, { status: 403 });
  }
  const store = await getStore(tenantId);
  if (!store) return NextResponse.json({ error: "Só para lojas" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { planId?: string; billingType?: string };
  const billingType: "monthly" | "annual" = body.billingType === "annual" ? "annual" : "monthly";
  await dbConnect();
  const plan = body.planId
    ? await Plan.findById(body.planId).lean<{ _id: unknown; name: string; price: number; annualPrice?: number | null; active: boolean; publico?: string }>()
    : null;
  if (!plan || !plan.active || !isPlanoAtendimento(plan)) {
    return NextResponse.json({ error: "Plano indisponível." }, { status: 400 });
  }
  if (billingType === "annual" && !(typeof plan.annualPrice === "number" && plan.annualPrice > 0)) {
    return NextResponse.json({ error: "Este plano não tem opção anual." }, { status: 400 });
  }

  const user = await User.findOne({ email }).select("_id email displayName cpf").lean<{ _id: unknown; email: string; cpf?: string }>();
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  // Quem compra é a loja: CNPJ da concessionária; senão, o CPF de quem paga.
  const conc = store.concessionariaId
    ? await Concessionaria.findById(store.concessionariaId).select("cnpj razaoSocial nome").lean<{ cnpj?: string; razaoSocial?: string; nome?: string }>()
    : null;
  const cnpj = String(conc?.cnpj ?? "").replace(/\D/g, "");
  const cpf = String(user.cpf ?? "").replace(/\D/g, "");
  const identification =
    cnpj.length === 14 && validateCNPJ(cnpj)
      ? { type: "CNPJ", number: cnpj }
      : cpf.length === 11 && validateCPF(cpf)
        ? { type: "CPF", number: cpf }
        : null;
  if (!identification) {
    return NextResponse.json(
      { error: "Para emitir o PIX, cadastre um CPF válido no seu perfil da zerokm.", code: "DOCUMENTO_OBRIGATORIO" },
      { status: 400 },
    );
  }

  const amount = precoPlano(plan, billingType);
  const payRes = await mpPost("/v1/payments", {
    transaction_amount: amount,
    description: `Atendimento com IA ${plan.name} (${billingType === "annual" ? "Anual" : "Mensal"}) — ${store.name}`,
    payment_method_id: "pix",
    payer: {
      email: user.email,
      ...(conc?.razaoSocial || conc?.nome ? { first_name: conc.razaoSocial || conc.nome } : {}),
      identification,
    },
    external_reference: referenciaAtendimento(String(store._id), String(plan._id), billingType, String(user._id)),
    notification_url: `${siteUrl(req)}/api/webhooks/mercadopago`,
    statement_descriptor: "CNV ATENDIMENTO",
    metadata: { type: "atendimento", store_id: String(store._id), plan_id: String(plan._id), billing_type: billingType },
  });
  if (!payRes.ok) {
    console.error("[atendimento] Erro ao gerar PIX:", JSON.stringify(payRes.data));
    return NextResponse.json({ error: payRes.data?.message || "Erro ao gerar PIX" }, { status: 400 });
  }
  const tx = payRes.data?.point_of_interaction?.transaction_data;
  return NextResponse.json({
    ok: true,
    paymentId: payRes.data.id,
    qrCode: tx?.qr_code || null,
    qrCodeBase64: tx?.qr_code_base64 || null,
    amount,
  });
}
