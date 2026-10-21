import mongoose from 'mongoose';
import User from '@/models/User';
import Plan from '@/models/Plan';
import Invite from '@/models/Invite';
import Payment from '@/models/Payment';
import { updatePreapproval } from '@/lib/mercadopago';
import { calculateSubscriptionAmount, normalizeBillingType } from '@/lib/services/mercadoPagoSubscriptionService';
import { arredondar, precoDoCliente, precoTabela, type Periodicidade, type ValorCombinado } from '@/lib/utils/valorCombinado';

/** Quem combina preço com cliente: perfis do financeiro. */
export const PERFIS_VALOR_COMBINADO = new Set(['admin', 'administrador', 'administrativo']);

export interface ResumoValorCombinado {
    plano: { id: string; nome: string; periodicidade: Periodicidade; tabela: number } | null;
    valorCombinado: (ValorCombinado & { vale: boolean }) | null;
    /** Valor da mensalidade (ou do ano) que o sistema cobra hoje, sem as telas extras. */
    valorAtual: number | null;
    telasExtras: number;
    valorPorTela: number;
    /** Próxima cobrança: plano + telas extras. */
    proximaCobranca: number | null;
    boletosEmAberto: number;
}

export async function resumoValorCombinado(userId: string): Promise<ResumoValorCombinado | null> {
    if (!mongoose.isValidObjectId(userId)) return null;
    const user = await User.findById(userId).select('subscription valorCombinado').lean() as any;
    if (!user) return null;

    const plan = user.subscription?.planId && mongoose.isValidObjectId(user.subscription.planId)
        ? await Plan.findById(user.subscription.planId).select('name price annualPrice invitePrice type').lean() as any
        : null;
    const periodicidade = normalizeBillingType(user.subscription?.billingType);
    const [telasExtras, boletosEmAberto] = await Promise.all([
        Invite.countDocuments({ inviterId: user._id, status: { $in: ['pending', 'accepted'] } }),
        Payment.countDocuments({ userId: user._id, status: { $in: ['pending', 'in_process'] }, method: { $in: ['bolbradesco', 'ticket'] } }),
    ]);

    const vc = user.valorCombinado?.valor ? user.valorCombinado as ValorCombinado : null;
    if (!plan || plan.type !== 'monthly') {
        return { plano: null, valorCombinado: vc ? { ...vc, vale: false } : null, valorAtual: null, telasExtras, valorPorTela: 0, proximaCobranca: null, boletosEmAberto };
    }

    const preco = precoDoCliente(plan, periodicidade, user);
    const { inviteUnitPrice, totalAmount } = calculateSubscriptionAmount(plan, periodicidade, telasExtras, user);
    return {
        plano: { id: String(plan._id), nome: plan.name, periodicidade, tabela: precoTabela(plan, periodicidade) },
        valorCombinado: vc ? { ...vc, vale: preco.combinado } : null,
        valorAtual: preco.valor,
        telasExtras,
        valorPorTela: inviteUnitPrice,
        proximaCobranca: arredondar(totalAmount),
        boletosEmAberto,
    };
}

/**
 * Grava (ou tira, com `valor` null) o valor combinado do plano atual do
 * cliente. Valor igual ao da tabela também tira: não há o que combinar.
 * Se o cliente paga por assinatura no cartão do Mercado Pago, atualiza o valor
 * da recorrência lá também, senão o cartão continuaria cobrando o antigo.
 */
export async function gravarValorCombinado(params: {
    userId: string;
    planId: string;
    periodicidade: Periodicidade;
    valor: number | null;
    observacao?: string;
    por: string;
}): Promise<{ assinaturaCartao: 'atualizada' | 'falhou' | null }> {
    const user = await User.findById(params.userId).select('subscription valorCombinado').lean() as any;
    if (!user) throw new Error('Cliente não encontrado');
    const plan = await Plan.findById(params.planId).select('name price annualPrice invitePrice').lean() as any;
    if (!plan) throw new Error('Plano não encontrado');

    const tabela = precoTabela(plan, params.periodicidade);
    const remover = params.valor === null || arredondar(params.valor) === arredondar(tabela);
    const novo: ValorCombinado | null = remover ? null : {
        valor: arredondar(params.valor as number),
        periodicidade: params.periodicidade,
        planId: String(plan._id),
        observacao: (params.observacao || '').trim().slice(0, 300) || undefined,
        atualizadoPor: params.por,
        atualizadoEm: new Date(),
    };

    await User.updateOne({ _id: user._id }, novo ? { $set: { valorCombinado: novo } } : { $unset: { valorCombinado: '' } });

    // Assinatura recorrente no cartão (preapproval) do mesmo plano e periodicidade.
    const sub = user.subscription || {};
    const temRecorrencia = sub.mpPreapprovalId
        && sub.mpPreapprovalStatus !== 'cancelled'
        && String(sub.planId) === String(plan._id)
        && normalizeBillingType(sub.billingType) === params.periodicidade;
    if (!temRecorrencia) return { assinaturaCartao: null };

    const telasExtras = await Invite.countDocuments({ inviterId: user._id, status: { $in: ['pending', 'accepted'] } });
    const { totalAmount } = calculateSubscriptionAmount(plan, params.periodicidade, telasExtras, { valorCombinado: novo });
    try {
        const res = await updatePreapproval(sub.mpPreapprovalId, { auto_recurring: { transaction_amount: arredondar(totalAmount), currency_id: 'BRL' } });
        if (!res.ok) console.error('[valor-combinado] Mercado Pago recusou o novo valor da assinatura:', res.status, res.data);
        return { assinaturaCartao: res.ok ? 'atualizada' : 'falhou' };
    } catch (error) {
        console.error('[valor-combinado] Falha ao atualizar a assinatura no Mercado Pago:', error);
        return { assinaturaCartao: 'falhou' };
    }
}
