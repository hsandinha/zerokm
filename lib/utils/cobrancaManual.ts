/**
 * Registro que a equipe criou à mão (ativação pelo CRM ou baixa manual): o
 * valor pode ser corrigido. O que veio do Mercado Pago tem o valor do banco.
 */
export function valorEditavel(pagamento: { mpPaymentId?: string | null; baixaManual?: { em?: unknown } | null; method?: string | null }): boolean {
    if (String(pagamento.mpPaymentId || '').startsWith('MANUAL-')) return true;
    if (pagamento.baixaManual?.em) return true;
    return pagamento.method === 'cortesia';
}
