/**
 * Plano da concessionária para anunciar repasse.
 *
 * O lojista (cliente) tem tudo incluso no plano dele. Quem paga pelo repasse é a
 * concessionária que anuncia. A assinatura fica na Concessionaria, não no User:
 * a loja paga uma vez e qualquer usuário dela cadastra (há lojas com 2 e 3
 * usuários). Também não passa pelo fluxo de assinatura do lojista, que força
 * o perfil "cliente" no usuário e quebraria o login da concessionária.
 *
 * Arquivo puro: usado pelo servidor e pela tela.
 */

export const PLAN_PUBLICOS = ['cliente', 'concessionaria'] as const;
export type PlanPublico = (typeof PLAN_PUBLICOS)[number];

export type PlanoRepasseStatus = 'active' | 'inactive' | 'cancelled';
export type PlanoRepasseMetodo = 'manual' | 'cortesia' | 'pix' | 'boleto' | 'card';

export type PlanoRepasse = {
    planId?: unknown;
    planName?: string;
    status?: PlanoRepasseStatus;
    billingType?: 'monthly' | 'annual';
    expiresAt?: Date | string | null;
    activationMethod?: PlanoRepasseMetodo;
    activatedAt?: Date | string | null;
    activatedBy?: string;
    /** Último pagamento do Mercado Pago aplicado. Evita estender duas vezes quando o webhook repete. */
    lastPaymentId?: string;
};

export const MSG_PLANO_REPASSE_INATIVO =
    'Para anunciar veículos de repasse, a concessionária precisa de um plano de repasse ativo.';

/** Plano exclusivo de concessionária? Planos antigos, sem o campo, são do lojista. */
export function isPlanoConcessionaria(plan: { publico?: unknown } | null | undefined): boolean {
    return plan?.publico === 'concessionaria';
}

export function isPlanoRepasseAtivo(plano: PlanoRepasse | null | undefined, now: Date = new Date()): boolean {
    if (!plano || plano.status !== 'active' || !plano.expiresAt) return false;
    const expira = new Date(plano.expiresAt);
    return Number.isFinite(expira.getTime()) && expira.getTime() > now.getTime();
}

/**
 * Nova validade ao pagar ou ativar. Se ainda está no prazo, soma ao fim do
 * período atual (a loja não perde dias pagos). Se já venceu, conta de agora:
 * durante o vencimento os anúncios ficaram fora da vitrine.
 */
export function calcularValidadeRepasse(
    expiresAtAtual: Date | string | null | undefined,
    billingType: 'monthly' | 'annual',
    now: Date = new Date(),
): Date {
    const atual = expiresAtAtual ? new Date(expiresAtAtual) : null;
    const base = atual && Number.isFinite(atual.getTime()) && atual.getTime() > now.getTime() ? atual : now;
    const next = new Date(base);
    if (billingType === 'annual') next.setFullYear(next.getFullYear() + 1);
    else next.setDate(next.getDate() + 30);
    return next;
}

/** Filtro Mongo "plano de repasse ativo". `prefix` = caminho até a concessionária ('' ou 'concessionariaInfo.'). */
export function filtroPlanoRepasseAtivo(prefix = '', now: Date = new Date()) {
    return {
        [`${prefix}planoRepasse.status`]: 'active',
        [`${prefix}planoRepasse.expiresAt`]: { $gt: now },
    };
}

/** Preço cobrado pelo período escolhido. Anual só existe se o plano tiver preço anual. */
export function precoPlano(plan: { price: number; annualPrice?: number | null }, billingType: 'monthly' | 'annual'): number {
    if (billingType === 'annual' && typeof plan.annualPrice === 'number' && plan.annualPrice > 0) return plan.annualPrice;
    return plan.price;
}

export function serializePlanoRepasse(plano: PlanoRepasse | null | undefined, now: Date = new Date()) {
    return {
        ativo: isPlanoRepasseAtivo(plano, now),
        status: plano?.status || 'inactive',
        planId: plano?.planId ? String(plano.planId) : null,
        planName: plano?.planName || null,
        billingType: plano?.billingType || null,
        expiresAt: plano?.expiresAt ? new Date(plano.expiresAt).toISOString() : null,
        activationMethod: plano?.activationMethod || null,
    };
}
