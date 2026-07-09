/**
 * Tags automáticas de origem, derivadas da frase inicial que o lead envia no WhatsApp.
 *
 * As três frases combinadas com o mesmo assunto ("criar minha conta"), então a
 * classificação olha só o trecho que as distingue de fato.
 */
export const LEAD_TAGS = {
    META_ABERTO: 'Meta - Público Aberto',
    META_SEGMENTADO: 'Meta - Público Segmentado',
    GOOGLE_LP: 'Google - LP',
} as const;

export const KNOWN_LEAD_TAGS: string[] = Object.values(LEAD_TAGS);

/** Marcadores em texto normalizado (sem acento, sem pontuação, minúsculo). */
const TAG_RULES: { tag: string; marker: string }[] = [
    // "Olá, vim pelo site e gostaria de criar minha conta na plataforma"
    { tag: LEAD_TAGS.GOOGLE_LP, marker: 'vim pelo site' },
    // "Olá! Vim do anúncio e gostaria de criar minha conta no CNV"
    { tag: LEAD_TAGS.META_ABERTO, marker: 'vim do anuncio' },
    // "Olá! Gostaria de criar minha conta no CNV que vi no anúncio"
    { tag: LEAD_TAGS.META_SEGMENTADO, marker: 'vi no anuncio' },
];

export function normalizeMessage(message: string): string {
    return message
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Devolve as tags de origem reconhecidas na frase inicial. Lista vazia = origem
 * desconhecida (lead orgânico ou entrada manual).
 */
export function classifyLeadTags(message?: string | null): string[] {
    if (!message) return [];

    const normalized = normalizeMessage(message);
    if (!normalized) return [];

    return TAG_RULES.filter(rule => normalized.includes(rule.marker)).map(rule => rule.tag);
}
