/**
 * Valor combinado: cliente que paga diferente da tabela.
 *
 * A equipe grava no cliente o valor acertado para o plano e a periodicidade
 * dele. Toda cobrança gerada pelo sistema (boleto de renovação, cartão,
 * cobrança pelo CRM, Pix da Vera, checkout) usa esse valor no lugar do preço
 * do plano. Se o cliente mudar de plano ou de periodicidade, volta a valer a
 * tabela, porque o combinado foi para aquele plano.
 *
 * As telas extras continuam somadas à parte, pelo preço do plano.
 */

export type Periodicidade = 'monthly' | 'annual';

export interface ValorCombinado {
    valor?: number | null;
    periodicidade?: Periodicidade | null;
    planId?: unknown;
    observacao?: string | null;
    atualizadoPor?: string | null;
    atualizadoEm?: Date | string | null;
}

interface PlanoComPreco {
    _id?: unknown;
    id?: unknown;
    price: number;
    annualPrice?: number | null;
}

/** Preço de tabela: anual é o total do ano; mensal, o da mensalidade. */
export function precoTabela(plan: PlanoComPreco, periodicidade: Periodicidade): number {
    if (periodicidade === 'annual' && typeof plan.annualPrice === 'number' && plan.annualPrice > 0) return plan.annualPrice;
    return plan.price;
}

/** O combinado vale para este plano e esta periodicidade? */
export function combinadoValePara(vc: ValorCombinado | null | undefined, plan: PlanoComPreco, periodicidade: Periodicidade): vc is ValorCombinado & { valor: number } {
    if (!vc || typeof vc.valor !== 'number' || !Number.isFinite(vc.valor) || vc.valor <= 0) return false;
    if ((vc.periodicidade || 'monthly') !== periodicidade) return false;
    const planoDoCombinado = vc.planId ? String(vc.planId) : '';
    const planoCobrado = String(plan._id ?? plan.id ?? '');
    return Boolean(planoDoCombinado) && planoDoCombinado === planoCobrado;
}

/** Preço que o sistema cobra deste cliente neste plano. */
export function precoDoCliente(
    plan: PlanoComPreco,
    periodicidade: Periodicidade,
    cliente?: { valorCombinado?: ValorCombinado | null } | null,
): { valor: number; tabela: number; combinado: boolean } {
    const tabela = precoTabela(plan, periodicidade);
    const vc = cliente?.valorCombinado;
    if (combinadoValePara(vc, plan, periodicidade)) return { valor: arredondar(vc.valor), tabela, combinado: true };
    return { valor: tabela, tabela, combinado: false };
}

export const arredondar = (valor: number) => Math.round(valor * 100) / 100;

/** "1.234,56", "1234.56", "R$ 500" → número. Vazio ou inválido → null. */
export function lerValorEmReais(entrada: unknown): number | null {
    if (typeof entrada === 'number') return Number.isFinite(entrada) ? arredondar(entrada) : null;
    if (typeof entrada !== 'string') return null;
    let texto = entrada.replace(/[^\d,.-]/g, '');
    if (!texto) return null;
    // Vírgula decimal (padrão brasileiro): ponto vira milhar.
    if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
    // "1.500" sem vírgula: ponto de milhar, não decimal.
    else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) texto = texto.replace(/\./g, '');
    const numero = Number(texto);
    return Number.isFinite(numero) ? arredondar(numero) : null;
}

export const LIMITE_VALOR_COMBINADO = 100_000;
