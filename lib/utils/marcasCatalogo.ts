/**
 * Marcas repetidas no catálogo.
 *
 * As marcas nasceram de planilhas e da FIPE, cada uma com a sua grafia: "GM",
 * "Chevrolet" e "GM - Chevrolet" viraram três marcas, "VW" e "VW - VolksWagen"
 * duas, e uma importação com a coluna trocada criou marca com nome de data.
 * Aqui só se aponta o suspeito. Quem decide unificar é a equipe, na tela.
 */

/** Grafias da mesma marca. A chave é a palavra normalizada (sem acento, maiúscula). */
const APELIDOS: Record<string, string> = {
    GM: 'CHEVROLET',
    CHEV: 'CHEVROLET',
    VW: 'VOLKSWAGEN',
    VOLKS: 'VOLKSWAGEN',
    BENZ: 'MERCEDES',
    MB: 'MERCEDES',
    LR: 'LAND ROVER',
    LANDROVER: 'LAND ROVER',
};

/** Palavras que acompanham o nome da marca e não a diferenciam ("Caoa Chery" = "Chery"). */
const ACOMPANHANTES = new Set(['CAOA', 'AUTOMOVEIS', 'AUTOMOVEL', 'DO', 'BRASIL', 'VEICULOS']);

function normalizar(nome: string) {
    return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/** Nome que só faz sentido como data ou número: "2026-01-15", "15/01/2026", "45678", "Thu Jan 15 2026". */
export function pareceData(nome: string): boolean {
    const texto = (nome || '').trim();
    if (!texto) return false;
    if (/^\d+([.,]\d+)?$/.test(texto)) return true;
    if (/^\d{1,4}[-/.]\d{1,2}([-/.]\d{1,4})?([ T]\d{1,2}:\d{2}.*)?$/.test(texto)) return true;
    if (/\b(19|20)\d{2}-\d{2}-\d{2}T\d{2}:\d{2}/.test(texto)) return true;
    return /\b(jan|fev|feb|mar|abr|apr|mai|may|jun|jul|ago|aug|set|sep|out|oct|nov|dez|dec)[a-z]*\.?\s+\d{1,2}\b.*\b(19|20)\d{2}\b/i.test(texto)
        || /\bGMT[+-]\d{4}\b/.test(texto);
}

/**
 * Chave que junta as grafias da mesma marca: "GM - Chevrolet", "GM" e
 * "chevrolet" dão "CHEVROLET"; "HONDA MOTOS" continua diferente de "HONDA",
 * porque são cadastros separados de propósito (moto e carro).
 */
export function chaveDaMarca(nome: string): string {
    const palavras = normalizar(nome)
        .split(/\s+-\s+|[\s\-_/.]+/)
        .map(p => p.replace(/[^A-Z0-9]/g, ''))
        .filter(Boolean);
    if (palavras.length === 0) return '';

    const juntas = palavras.join('');
    if (APELIDOS[juntas]) return APELIDOS[juntas];

    const canonicas = palavras.map(p => APELIDOS[p] || p);
    const unicas = [...new Set(canonicas)];
    const semAcompanhantes = unicas.filter(p => !ACOMPANHANTES.has(p));
    const finais = semAcompanhantes.length > 0 ? semAcompanhantes : unicas;

    // "VW - VolksWagen": a sigla e o nome viram a mesma palavra e sobra uma só.
    // "Mercedes-Benz": BENZ vira MERCEDES e sobra uma só.
    return finais.join(' ');
}

export interface MarcaParaComparar {
    id: string;
    nome: string;
}

/** Para cada marca, as outras que parecem a mesma. Marcas sem suspeita ficam de fora. */
export function marcasParecidas<T extends MarcaParaComparar>(marcas: T[]): Map<string, T[]> {
    const porChave = new Map<string, T[]>();
    for (const marca of marcas) {
        const chave = chaveDaMarca(marca.nome);
        if (!chave) continue;
        const grupo = porChave.get(chave) || [];
        grupo.push(marca);
        porChave.set(chave, grupo);
    }

    const resultado = new Map<string, T[]>();
    for (const grupo of porChave.values()) {
        if (grupo.length < 2) continue;
        for (const marca of grupo) resultado.set(marca.id, grupo.filter(m => m.id !== marca.id));
    }
    return resultado;
}
