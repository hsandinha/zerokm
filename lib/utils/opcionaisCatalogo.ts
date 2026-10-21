/** Opcionais do catálogo na edição em massa. */

const itensDeOpcionais = (texto: string) => texto.split(/[,;|]/).map(item => item.trim()).filter(Boolean);
const chaveDoItem = (item: string) => item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');

/**
 * "Taxa zero" acrescentado a "Ar, Direção" vira "Ar, Direção, Taxa zero".
 * Compara item a item ("Ar" não some por existir "Carregador") e parte da
 * lista padrão quando o texto está vazio, para não perder o que já havia.
 */
export function acrescentarOpcionais(atual: { opcionais?: string; opcionaisPadrao?: string[] }, novo: string) {
    const base = (atual.opcionais || '').trim() || (atual.opcionaisPadrao || []).join(', ');
    const itens = itensDeOpcionais(base);
    const vistos = new Set(itens.map(chaveDoItem));
    const acrescentados = itensDeOpcionais(novo).filter(item => {
        const chave = chaveDoItem(item);
        if (vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
    if (acrescentados.length === 0) return { opcionais: base, padrao: atual.opcionaisPadrao?.length ? atual.opcionaisPadrao : itens, mudou: false };
    const padraoAtual = atual.opcionaisPadrao?.length ? atual.opcionaisPadrao : itens;
    return {
        opcionais: base ? `${base.replace(/[,;|]\s*$/, '')}, ${acrescentados.join(', ')}` : acrescentados.join(', '),
        padrao: [...padraoAtual, ...acrescentados],
        mudou: true,
    };
}
