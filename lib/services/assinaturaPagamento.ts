import User from '@/models/User';
import Plan from '@/models/Plan';
import Invite from '@/models/Invite';
import Payment from '@/models/Payment';
import Transaction from '@/models/Transaction';

type Periodicidade = 'monthly' | 'annual';

function somarPeriodo(base: Date, periodicidade: Periodicidade): Date {
    const d = new Date(base);
    if (periodicidade === 'annual') d.setFullYear(d.getFullYear() + 1);
    else d.setDate(d.getDate() + 30);
    return d;
}

/**
 * Próximo vencimento depois de um pagamento recebido fora do webhook.
 * Conta a partir do vencimento atual (pagou adiantado não perde dias; pagou
 * atrasado mantém o dia do mês). Se ficou mais de um período sem pagar,
 * recomeça de hoje.
 */
export function proximoVencimento(atual: Date | string | null | undefined, periodicidade: Periodicidade, agora: Date = new Date()): Date {
    const base = atual ? new Date(atual) : null;
    if (!base || Number.isNaN(base.getTime())) return somarPeriodo(agora, periodicidade);
    const proximo = somarPeriodo(base, periodicidade);
    return proximo.getTime() <= agora.getTime() ? somarPeriodo(agora, periodicidade) : proximo;
}

/**
 * Renova a assinatura do cliente por um pagamento aprovado que não passou
 * pelo webhook: baixa manual na tela de Cobranças, ou boleto que o Mercado Pago
 * aprovou e o webhook não avisou (só a sincronização da tela viu).
 *
 * Era o desencontro "Cobrança x CRM": a Cobranças mostrava Pago e o CRM
 * continuava Expirado, porque só o webhook estendia a assinatura.
 *
 * Idempotente pelo campo `assinaturaAplicadaEm` do Payment: o primeiro que
 * chegar marca, os demais não fazem nada.
 */
export async function aplicarPagamentoNaAssinatura(params: {
    paymentDocId: unknown;
    metodo: string;
    descricao?: string;
}): Promise<{ aplicado: boolean; motivo?: string; expiresAt?: Date }> {
    const filtro: Record<string, unknown> = { _id: params.paymentDocId, assinaturaAplicadaEm: { $exists: false } };
    const pagamento = await Payment.findOneAndUpdate(
        filtro,
        { $set: { assinaturaAplicadaEm: new Date() } },
        { returnDocument: 'after' },
    );
    if (!pagamento) return { aplicado: false, motivo: 'Este pagamento já tinha renovado a assinatura.' };

    const desfazer = () => Payment.updateOne({ _id: pagamento._id }, { $unset: { assinaturaAplicadaEm: '' } });

    const user = await User.findById(pagamento.userId);
    if (!user) {
        await desfazer();
        return { aplicado: false, motivo: 'Cliente do pagamento não encontrado.' };
    }
    const planId = pagamento.planId || (user.subscription?.planId as any);
    const plan = planId ? await Plan.findById(planId) : null;
    if (!plan) {
        await desfazer();
        return { aplicado: false, motivo: 'Pagamento sem plano: registre a assinatura pelo CRM (Atribuir plano).' };
    }

    const periodicidade: Periodicidade = pagamento.billingType === 'annual' || user.subscription?.billingType === 'annual' ? 'annual' : 'monthly';
    let expiresAt: Date | undefined;

    if (plan.type === 'monthly') {
        expiresAt = proximoVencimento(user.subscription?.expiresAt, periodicidade);
        await User.updateOne(
            { _id: user._id },
            {
                $addToSet: { allowedProfiles: 'cliente' },
                $set: {
                    defaultProfile: 'cliente',
                    'subscription.planId': String(plan._id),
                    'subscription.status': 'active',
                    'subscription.expiresAt': expiresAt,
                    'subscription.billingType': periodicidade,
                },
                $inc: { profileVersion: 1 },
            },
        );
    } else if (plan.type === 'credits' && plan.credits) {
        await User.updateOne(
            { _id: user._id },
            {
                $addToSet: { allowedProfiles: 'cliente' },
                $set: { defaultProfile: 'cliente', 'subscription.planId': String(plan._id), 'subscription.status': 'active' },
                $inc: { credits: plan.credits, profileVersion: 1 },
            },
        );
    }
    await User.updateOne({ _id: user._id }, { $pull: { allowedProfiles: 'gratis' } });

    // Extrato do cliente.
    const agora = new Date();
    const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    await Transaction.findOneAndUpdate(
        { referenceId: String(pagamento.mpPaymentId || pagamento._id) },
        {
            $set: {
                userId: user._id,
                type: plan.type === 'credits' ? 'credit' : 'subscription',
                description: params.descricao || `Pagamento: ${plan.name} (${periodicidade === 'annual' ? 'Anual' : 'Mensal'}) via ${params.metodo}`,
                amount: pagamento.amount || plan.price,
                referenceId: String(pagamento.mpPaymentId || pagamento._id),
                month: mes,
                status: 'paid',
            },
        },
        { upsert: true },
    );

    // Telas extras acompanham a conta principal (mesma regra do webhook).
    if (expiresAt) {
        const convites = await Invite.find({ inviterId: user._id, status: { $in: ['accepted', 'pending'] } }).lean();
        const ids = convites.map((c: any) => c.inviteeUserId).filter(Boolean);
        if (ids.length) {
            await User.updateMany(
                { _id: { $in: ids } },
                {
                    $addToSet: { allowedProfiles: 'cliente' },
                    $set: {
                        defaultProfile: 'cliente',
                        'subscription.planId': String(plan._id),
                        'subscription.status': 'active',
                        'subscription.expiresAt': expiresAt,
                        'subscription.billingType': periodicidade,
                    },
                    $inc: { profileVersion: 1 },
                },
            );
            await User.updateMany({ _id: { $in: ids } }, { $pull: { allowedProfiles: 'gratis' } });
        }
    }

    return { aplicado: true, expiresAt };
}
