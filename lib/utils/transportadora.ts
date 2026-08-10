import { formatBrazilPhone, normalizeBrazilWhatsAppNumber } from '@/lib/utils/leadWhatsApp';

/**
 * Transportadora parceira da CNV.
 *
 * A tabela de frete (coleção `transportadoras`) guarda só faixas de preço por
 * estado — não tem campo de transportadora, porque todas as 35 faixas são desta
 * mesma empresa. Por isso a identidade fica aqui, num lugar só: trocar de
 * parceira ou de telefone é alterar estas duas linhas.
 */
export const TRANSPORTADORA_PARCEIRA = {
    nome: 'Primo Transportes',
    telefone: '11910359987',
} as const;

/** "(11) 91035-9987" */
export function telefoneTransportadora(): string {
    return formatBrazilPhone(TRANSPORTADORA_PARCEIRA.telefone);
}

/** Link do WhatsApp já com a mensagem sobre o veículo, quando informado. */
export function whatsappTransportadora(assunto?: string): string {
    const numero = normalizeBrazilWhatsAppNumber(TRANSPORTADORA_PARCEIRA.telefone);
    const texto = assunto
        ? `Olá! Preciso de uma cotação de frete para: ${assunto}`
        : 'Olá! Preciso de uma cotação de frete.';
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
