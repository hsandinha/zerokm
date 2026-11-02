// Assinatura do atendimento (Chatrun) de uma loja — mesmo desenho do plano de
// repasse da concessionária (lib/services/planoRepasseService.ts): plano com
// público "atendimento", PIX no Mercado Pago com referência própria e
// ativação idempotente pelo webhook; o CNV também ativa à mão (manual ou
// cortesia). A IA e os disparos a loja paga direto aos provedores.
//
// Referência externa no Mercado Pago:
//   ATEND:<storeId>:<planId>:<monthly|annual>:<userId>

import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Payment from "@/models/Payment";
import Plan from "@/models/Plan";
import Transaction from "@/models/Transaction";
import { calcularValidadeRepasse, isPlanoAtendimento } from "@/lib/utils/planoRepasse";
import { WaStore } from "@wa/models/store";

export const ATENDIMENTO_PREFIX = "ATEND:";
export type MetodoAtivacao = "manual" | "cortesia" | "pix" | "boleto" | "card";

export function referenciaAtendimento(
  storeId: string,
  planId: string,
  billingType: "monthly" | "annual",
  userId: string,
): string {
  return `${ATENDIMENTO_PREFIX}${storeId}:${planId}:${billingType}:${userId}`;
}

export function lerReferenciaAtendimento(ref: unknown) {
  if (typeof ref !== "string" || !ref.startsWith(ATENDIMENTO_PREFIX)) return null;
  const [, storeId, planId, billing, userId] = ref.split(":");
  if (!mongoose.isValidObjectId(storeId) || !mongoose.isValidObjectId(planId)) return null;
  return {
    storeId,
    planId,
    billingType: (billing === "annual" ? "annual" : "monthly") as "monthly" | "annual",
    userId: userId && mongoose.isValidObjectId(userId) ? userId : null,
  };
}

/**
 * Ativa ou renova (soma ao período em dia). `paymentId` torna idempotente:
 * webhook repetido não soma 30 dias de novo.
 */
export async function aplicarAssinaturaAtendimento(params: {
  storeId: string;
  planId: string;
  billingType: "monthly" | "annual";
  metodo: MetodoAtivacao;
  por?: string;
  paymentId?: string;
}): Promise<{ ok: true; aplicado: boolean } | { ok: false; error: string; status: number }> {
  await dbConnect();
  const plan = await Plan.findById(params.planId).lean<{ _id: unknown; name: string; publico?: string }>();
  if (!plan) return { ok: false, error: "Plano não encontrado.", status: 404 };
  if (!isPlanoAtendimento(plan)) return { ok: false, error: "Este plano não é de atendimento.", status: 400 };

  const store = await WaStore.findById(params.storeId).select("subscription").lean();
  if (!store) return { ok: false, error: "Loja não encontrada.", status: 404 };
  if (params.paymentId && store.subscription?.lastPaymentId === params.paymentId) {
    return { ok: true, aplicado: false };
  }

  const filter: Record<string, unknown> = { _id: store._id };
  if (params.paymentId) filter["subscription.lastPaymentId"] = { $ne: params.paymentId };
  const updated = await WaStore.findOneAndUpdate(filter, {
    $set: {
      subscription: {
        planId: plan._id,
        planName: plan.name,
        status: "active",
        billingType: params.billingType,
        expiresAt: calcularValidadeRepasse(store.subscription?.expiresAt, params.billingType),
        activationMethod: params.metodo,
        activatedAt: new Date(),
        activatedBy: params.por,
        lastPaymentId: params.paymentId || store.subscription?.lastPaymentId,
      },
    },
  });
  return { ok: true, aplicado: Boolean(updated) };
}

export async function desativarAssinaturaAtendimento(storeId: string, por?: string) {
  await dbConnect();
  return WaStore.findByIdAndUpdate(
    storeId,
    { $set: { "subscription.status": "cancelled", "subscription.activatedBy": por } },
    { new: true },
  );
}

function metodoDoPagamento(payment: { payment_method_id?: string; payment_type_id?: string }): MetodoAtivacao {
  const method = payment.payment_method_id || "";
  const type = payment.payment_type_id || "";
  if (method === "pix" || type === "bank_transfer") return "pix";
  if (method === "bolbradesco" || type === "ticket") return "boleto";
  return "card";
}

/** Chamado pelo webhook do Mercado Pago para referências ATEND:. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function processarPagamentoAtendimento(payment: any, paymentId: string) {
  const ref = lerReferenciaAtendimento(payment.external_reference);
  if (!ref) {
    console.error("[Webhook] Referência de atendimento inválida:", payment.external_reference);
    return;
  }
  await dbConnect();
  const status: string = payment.status;
  const store = await WaStore.findById(ref.storeId).select("concessionariaId name").lean();

  if (ref.userId) {
    await Payment.findOneAndUpdate(
      { mpPaymentId: String(paymentId) },
      {
        $set: {
          userId: ref.userId,
          planId: ref.planId,
          ...(store?.concessionariaId ? { concessionariaId: store.concessionariaId } : {}),
          mpPaymentId: String(paymentId),
          externalReference: payment.external_reference,
          method: payment.payment_type_id || payment.payment_method_id || "pix",
          methodDetail: payment.payment_method_id,
          status,
          statusDetail: payment.status_detail,
          amount: payment.transaction_amount || 0,
          currency: payment.currency_id || "BRL",
          billingType: ref.billingType,
          payerEmail: payment.payer?.email,
          mpDateCreated: payment.date_created ? new Date(payment.date_created) : undefined,
          mpDateApproved: payment.date_approved ? new Date(payment.date_approved) : undefined,
        },
      },
      { upsert: true },
    );
  }
  if (status !== "approved") return;

  const result = await aplicarAssinaturaAtendimento({
    storeId: ref.storeId,
    planId: ref.planId,
    billingType: ref.billingType,
    metodo: metodoDoPagamento(payment),
    por: "mercadopago",
    paymentId: String(paymentId),
  });
  if (!result.ok) {
    console.error("[Webhook] Não foi possível ativar o atendimento:", result.error, ref);
    return;
  }
  if (result.aplicado && ref.userId) {
    const now = new Date();
    await Transaction.findOneAndUpdate(
      { referenceId: String(paymentId) },
      {
        $set: {
          userId: ref.userId,
          type: "subscription",
          description: `Atendimento com IA - ${store?.name ?? ""} (${ref.billingType === "annual" ? "Anual" : "Mensal"})`,
          amount: payment.transaction_amount || 0,
          referenceId: String(paymentId),
          month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
          status: "paid",
        },
      },
      { upsert: true },
    );
  }
}
