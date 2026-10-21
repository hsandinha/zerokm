/**
 * Quando o acesso do assinante é bloqueado.
 *
 * O vencimento é gravado ao meio-dia UTC (9h em Brasília) e o bloqueio era no
 * mesmo instante: no dia em que o boleto vence o cliente já ficava travado,
 * antes de conseguir pagar. Pedido do Márcio: bloquear só um dia depois do
 * vencimento. O acesso vai até o fim do dia do vencimento (horário de Brasília)
 * e o bloqueio começa no dia seguinte, à 0h.
 *
 * Para dar mais folga, aumente DIAS_DE_TOLERANCIA (1 = bloqueia no dia
 * seguinte ao vencimento; 2 = dois dias depois, e assim por diante).
 */
export const DIAS_DE_TOLERANCIA = 1;

/** Brasília está em UTC-3 o ano todo desde 2019 (sem horário de verão). */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

/** Momento exato do bloqueio: 0h (Brasília) do dia seguinte ao vencimento. */
export function inicioDoBloqueio(expiresAt: Date | string): Date {
    const vencimento = new Date(expiresAt);
    const emBrasilia = new Date(vencimento.getTime() - OFFSET_BRASILIA_MS);
    const meiaNoiteBrasiliaEmUtc = Date.UTC(
        emBrasilia.getUTCFullYear(),
        emBrasilia.getUTCMonth(),
        emBrasilia.getUTCDate() + DIAS_DE_TOLERANCIA,
    ) + OFFSET_BRASILIA_MS;
    return new Date(meiaNoiteBrasiliaEmUtc);
}

/** O assinante já está bloqueado? */
export function acessoBloqueado(expiresAt: Date | string | null | undefined, agora: Date = new Date()): boolean {
    if (!expiresAt) return false;
    const vencimento = new Date(expiresAt);
    if (Number.isNaN(vencimento.getTime())) return false;
    return agora.getTime() >= inicioDoBloqueio(vencimento).getTime();
}

/** Venceu mas ainda está na tolerância (acesso liberado, aviso para pagar). */
export function emTolerancia(expiresAt: Date | string | null | undefined, agora: Date = new Date()): boolean {
    if (!expiresAt) return false;
    const vencimento = new Date(expiresAt);
    if (Number.isNaN(vencimento.getTime())) return false;
    return agora.getTime() >= vencimento.getTime() && !acessoBloqueado(vencimento, agora);
}
