import Payment from '@/models/Payment';
import { searchPayments } from '@/lib/mercadopago';

/**
 * A tela de Cobranças precisa mostrar a realidade do Mercado Pago, não a nossa
 * cópia dela.
 *
 * Dois furos apareceram na conferência de 22/09/2026:
 *  1. boleto cancelado ou vencido no MP continuava "pendente" no nosso banco
 *     (o webhook nem sempre chega para expiração);
 *  2. boleto emitido à mão no painel do MP não existe aqui — eram 33 contra 4
 *     do sistema, e foi assim que dois clientes receberam boletos duplicados
 *     com valores diferentes.
 *
 * Uma única busca no MP resolve os dois: ela devolve status, link do boleto e
 * linha digitável de tudo que foi emitido na janela.
 */

export type BoletoDoMP = {
    id: string;
    status: string;
    valor: number;
    criadoEm: string | null;
    expiraEm: string | null;
    descricao: string;
    externalReference: string | null;
    boletoUrl: string | null;
    boletoBarcode: string | null;
};

export async function buscarBoletosNoMP(diasParaTras = 45): Promise<{ porId: Map<string, BoletoDoMP>; erro?: string }> {
    const desde = new Date(Date.now() - diasParaTras * 864e5);
    const res = await searchPayments({ desde });
    if (!res.ok) {
        console.error('[cobrancas] Busca no Mercado Pago falhou:', res.status, res.data);
        return { porId: new Map(), erro: 'Não foi possível consultar o Mercado Pago agora.' };
    }

    const porId = new Map<string, BoletoDoMP>();
    for (const p of res.data?.results || []) {
        if (p.payment_method_id !== 'bolbradesco' && p.payment_type_id !== 'ticket') continue;
        porId.set(String(p.id), {
            id: String(p.id),
            status: p.status,
            valor: p.transaction_amount || 0,
            criadoEm: p.date_created || null,
            expiraEm: p.date_of_expiration || null,
            descricao: p.description || '',
            externalReference: p.external_reference || null,
            boletoUrl: p.transaction_details?.external_resource_url || null,
            boletoBarcode: p.barcode?.content || null,
        });
    }
    return { porId };
}

/**
 * Corrige no nosso banco o status dos boletos que mudaram no MP. Só grava
 * quando muda, para não reescrever tudo a cada abertura da tela.
 */
export async function sincronizarStatus(nossos: any[], porId: Map<string, BoletoDoMP>): Promise<number> {
    const mudancas = nossos
        .filter(p => p.mpPaymentId && porId.get(String(p.mpPaymentId))?.status && porId.get(String(p.mpPaymentId))!.status !== p.status)
        .map(p => ({ id: p._id, de: p.status, para: porId.get(String(p.mpPaymentId))!.status }));

    for (const m of mudancas) {
        await Payment.findByIdAndUpdate(m.id, { $set: { status: m.para } });
        console.log('[cobrancas] Status corrigido pelo Mercado Pago:', { paymentId: String(m.id), de: m.de, para: m.para });
    }
    return mudancas.length;
}

/** "Cobrança para CENTRAL" → "CENTRAL". É o que o painel do MP grava. */
export function nomeNaDescricao(descricao: string): string {
    return String(descricao || '').replace(/^Cobran[çc]a para\s*/i, '').trim();
}

const limpar = (s: unknown) => String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Tenta achar o dono de um boleto emitido no painel, onde só existe a
 * descrição. Devolve null quando a semelhança é fraca: melhor dizer "não
 * identificado" do que apontar o cliente errado numa cobrança.
 */
export function acharClientePorNome<T extends { displayName?: string; email?: string }>(
    descricao: string,
    clientes: T[],
): T | null {
    const alvo = limpar(nomeNaDescricao(descricao));
    if (!alvo) return null;
    const palavras = alvo.split(' ').filter(p => p.length > 2);
    if (palavras.length === 0) return null;

    let melhor: { cliente: T; score: number } | null = null;
    for (const cliente of clientes) {
        const nome = limpar(cliente.displayName);
        if (!nome) continue;
        const acertos = palavras.filter(p => nome.includes(p)).length;
        const score = acertos / palavras.length;
        if (score > (melhor?.score ?? 0)) melhor = { cliente, score };
    }
    return melhor && melhor.score >= 0.5 ? melhor.cliente : null;
}
