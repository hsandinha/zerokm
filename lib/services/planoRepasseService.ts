import mongoose from 'mongoose';
import Concessionaria from '@/models/Concessionaria';
import Payment from '@/models/Payment';
import Plan from '@/models/Plan';
import Transaction from '@/models/Transaction';
import User from '@/models/User';
import {
    calcularValidadeRepasse,
    isPlanoConcessionaria,
    type PlanoRepasseMetodo,
} from '@/lib/utils/planoRepasse';

/**
 * Referência externa do pagamento do plano de repasse no Mercado Pago:
 *   DEALERPLAN:<concessionariaId>:<planId>:<monthly|annual>:<userId>
 *
 * Prefixo próprio, como o BANNER:, para o webhook desviar ANTES do fluxo de
 * assinatura do lojista (que interpreta "a:b:c" como firebaseUid:plano:período
 * e trocaria o perfil do usuário para "cliente").
 */
export const DEALER_PLAN_PREFIX = 'DEALERPLAN:';

export function buildDealerPlanReference(concessionariaId: string, planId: string, billingType: 'monthly' | 'annual', userId: string) {
    return `${DEALER_PLAN_PREFIX}${concessionariaId}:${planId}:${billingType}:${userId}`;
}

export function parseDealerPlanReference(ref: unknown) {
    if (typeof ref !== 'string' || !ref.startsWith(DEALER_PLAN_PREFIX)) return null;
    const [, concessionariaId, planId, billing, userId] = ref.split(':');
    if (!mongoose.Types.ObjectId.isValid(concessionariaId) || !mongoose.Types.ObjectId.isValid(planId)) return null;
    return {
        concessionariaId,
        planId,
        billingType: (billing === 'annual' ? 'annual' : 'monthly') as 'monthly' | 'annual',
        userId: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null,
    };
}

/**
 * Ativa ou renova o plano de repasse da concessionária.
 *
 * `paymentId` torna a operação idempotente: o filtro só casa se esse pagamento
 * ainda não foi aplicado, então um webhook repetido não soma 30 dias de novo.
 */
export async function aplicarPlanoRepasse(params: {
    concessionariaId: string;
    planId: string;
    billingType: 'monthly' | 'annual';
    metodo: PlanoRepasseMetodo;
    por?: string;
    paymentId?: string;
    now?: Date;
}): Promise<{ ok: true; concessionaria: any; aplicado: boolean } | { ok: false; error: string; status: number }> {
    const now = params.now || new Date();
    const plan = await Plan.findById(params.planId).lean() as any;
    if (!plan) return { ok: false, error: 'Plano não encontrado.', status: 404 };
    if (!isPlanoConcessionaria(plan)) return { ok: false, error: 'Este plano não é de concessionária.', status: 400 };

    const atual = await Concessionaria.findById(params.concessionariaId).select('planoRepasse').lean() as any;
    if (!atual) return { ok: false, error: 'Concessionária não encontrada.', status: 404 };

    if (params.paymentId && atual.planoRepasse?.lastPaymentId === params.paymentId) {
        return { ok: true, concessionaria: atual, aplicado: false };
    }

    const expiresAt = calcularValidadeRepasse(atual.planoRepasse?.expiresAt, params.billingType, now);
    const filter: Record<string, unknown> = { _id: atual._id };
    if (params.paymentId) filter['planoRepasse.lastPaymentId'] = { $ne: params.paymentId };

    const updated = await Concessionaria.findOneAndUpdate(
        filter,
        {
            $set: {
                planoRepasse: {
                    planId: plan._id,
                    planName: plan.name,
                    status: 'active',
                    billingType: params.billingType,
                    expiresAt,
                    activationMethod: params.metodo,
                    activatedAt: now,
                    activatedBy: params.por,
                    lastPaymentId: params.paymentId || atual.planoRepasse?.lastPaymentId,
                },
            },
        },
        { new: true },
    ).lean();

    // Corrida entre duas entregas do mesmo webhook: a outra já aplicou.
    if (!updated) return { ok: true, concessionaria: atual, aplicado: false };
    return { ok: true, concessionaria: updated, aplicado: true };
}

export async function desativarPlanoRepasse(concessionariaId: string, por?: string) {
    return Concessionaria.findByIdAndUpdate(
        concessionariaId,
        { $set: { 'planoRepasse.status': 'cancelled', 'planoRepasse.activatedBy': por } },
        { new: true },
    ).lean();
}

function metodoDoPagamento(payment: any): PlanoRepasseMetodo {
    const method = payment.payment_method_id || '';
    const type = payment.payment_type_id || '';
    if (method === 'pix' || type === 'bank_transfer') return 'pix';
    if (method === 'bolbradesco' || type === 'ticket') return 'boleto';
    return 'card';
}

/**
 * Chamado pelo webhook do Mercado Pago quando a referência começa com DEALERPLAN:.
 * Registra o pagamento e, se aprovado, ativa/renova o plano da loja.
 */
export async function processarPagamentoPlanoRepasse(payment: any, paymentId: string) {
    const ref = parseDealerPlanReference(payment.external_reference);
    if (!ref) {
        console.error('[Webhook] Referência de plano de repasse inválida:', payment.external_reference);
        return;
    }

    const status: string = payment.status;
    const userId = ref.userId || (await User.findOne({ dealershipId: ref.concessionariaId }).select('_id').lean() as any)?._id;

    if (userId) {
        await Payment.findOneAndUpdate(
            { mpPaymentId: String(paymentId) },
            {
                $set: {
                    userId,
                    planId: ref.planId,
                    concessionariaId: ref.concessionariaId,
                    mpPaymentId: String(paymentId),
                    externalReference: payment.external_reference,
                    method: payment.payment_type_id || payment.payment_method_id || 'pix',
                    methodDetail: payment.payment_method_id,
                    status,
                    statusDetail: payment.status_detail,
                    amount: payment.transaction_amount || 0,
                    currency: payment.currency_id || 'BRL',
                    billingType: ref.billingType,
                    payerEmail: payment.payer?.email,
                    mpDateCreated: payment.date_created ? new Date(payment.date_created) : undefined,
                    mpDateApproved: payment.date_approved ? new Date(payment.date_approved) : undefined,
                },
            },
            { upsert: true },
        );
    } else {
        console.error('[Webhook] Plano de repasse sem usuário para registrar o pagamento:', paymentId, ref.concessionariaId);
    }

    if (status !== 'approved') {
        console.log(`[Webhook] Plano de repasse ${paymentId} — status ${status}, nada a ativar.`);
        return;
    }

    const result = await aplicarPlanoRepasse({
        concessionariaId: ref.concessionariaId,
        planId: ref.planId,
        billingType: ref.billingType,
        metodo: metodoDoPagamento(payment),
        por: 'mercadopago',
        paymentId: String(paymentId),
    });

    if (!result.ok) {
        console.error('[Webhook] Não foi possível ativar o plano de repasse:', result.error, ref);
        return;
    }

    if (result.aplicado && userId) {
        const now = new Date();
        await Transaction.findOneAndUpdate(
            { referenceId: String(paymentId) },
            {
                $set: {
                    userId,
                    type: 'subscription',
                    description: `Plano de Repasse - ${result.concessionaria?.planoRepasse?.planName || ''} (${ref.billingType === 'annual' ? 'Anual' : 'Mensal'})`,
                    amount: payment.transaction_amount || 0,
                    referenceId: String(paymentId),
                    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
                    status: 'paid',
                },
            },
            { upsert: true },
        );
    }
    console.log(`[Webhook] Plano de repasse ${result.aplicado ? 'ativado' : 'já aplicado'} para a concessionária ${ref.concessionariaId}.`);
}
