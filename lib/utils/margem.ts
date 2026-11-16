// Margem da consulta de veículos: uma margem geral (percentual ou valor fixo)
// e, opcionalmente, faixas de preço, cada uma com a sua margem. Arquivo puro
// (sem banco, sem React): a tela, o PDF, a exportação e a IA do lojista usam a
// mesma conta, e o preço mostrado em todo lugar é o mesmo.
//
// Faixa: vale para veículos com preço ATÉ `ate` (inclusive) e acima do teto
// da faixa anterior. Preço acima da última faixa usa a margem geral.

export type TipoDeMargem = 'percent' | 'fixed';

export type FaixaDeMargem = {
    /** Teto da faixa, em reais (inclusive). */
    ate: number;
    tipo: TipoDeMargem;
    /** Percentual (5 = 5%) ou valor em reais, conforme o tipo. */
    valor: number;
};

export type ConfigDeMargem = {
    margem: number;
    marginMode: TipoDeMargem;
    fixedMargin: number;
    faixas?: FaixaDeMargem[];
};

export const MAX_FAIXAS = 12;
const TETO_MAXIMO = 1_000_000_000;

const numero = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
};

/**
 * Faixas válidas, em ordem crescente de teto. Devolve `null` quando a lista
 * tem algo errado (para a rota recusar); lista vazia ou ausente vira [].
 */
export function validarFaixas(entrada: unknown): { faixas: FaixaDeMargem[] } | { erro: string } {
    if (entrada === undefined || entrada === null) return { faixas: [] };
    if (!Array.isArray(entrada)) return { erro: 'Faixas de margem inválidas.' };
    if (entrada.length > MAX_FAIXAS) return { erro: `Use no máximo ${MAX_FAIXAS} faixas de preço.` };
    const faixas: FaixaDeMargem[] = [];
    for (const item of entrada) {
        const f = (item ?? {}) as Record<string, unknown>;
        const ate = numero(f.ate);
        const valor = numero(f.valor);
        const tipo = f.tipo;
        if (ate === null || ate <= 0 || ate > TETO_MAXIMO) return { erro: 'Informe até que preço cada faixa vale.' };
        if (tipo !== 'percent' && tipo !== 'fixed') return { erro: 'Tipo de margem da faixa inválido.' };
        if (valor === null || valor < 0) return { erro: 'Informe a margem de cada faixa.' };
        if (tipo === 'percent' && valor > 100) return { erro: 'A margem percentual de uma faixa vai de 0 a 100.' };
        faixas.push({ ate, tipo, valor });
    }
    faixas.sort((a, b) => a.ate - b.ate);
    for (let i = 1; i < faixas.length; i++) {
        if (faixas[i].ate === faixas[i - 1].ate) return { erro: 'Há duas faixas com o mesmo preço limite.' };
    }
    return { faixas };
}

/** O que veio do banco, sem confiar: o que não for faixa válida some. */
export function faixasSalvas(entrada: unknown): FaixaDeMargem[] {
    const r = validarFaixas(entrada);
    return 'faixas' in r ? r.faixas : [];
}

/** A faixa que vale para aquele preço, ou null (usa a margem geral). */
export function faixaDoPreco(preco: number, faixas: FaixaDeMargem[] | undefined): FaixaDeMargem | null {
    if (!faixas?.length) return null;
    // Não confia na ordem de quem chamou.
    let escolhida: FaixaDeMargem | null = null;
    for (const f of faixas) {
        if (preco <= f.ate && (!escolhida || f.ate < escolhida.ate)) escolhida = f;
    }
    return escolhida;
}

/** Preço com a margem: a da faixa em que o preço cai, senão a geral. */
export function aplicarMargem(precoBase: number | null | undefined, cfg: ConfigDeMargem): number {
    const base = precoBase || 0;
    const faixa = faixaDoPreco(base, cfg.faixas);
    if (faixa) {
        return faixa.tipo === 'fixed' ? base + faixa.valor : base * (1 + faixa.valor / 100);
    }
    if (cfg.marginMode === 'fixed') return base + (cfg.fixedMargin || 0);
    return base * (1 + (cfg.margem || 0) / 100);
}

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

/** "Até R$ 100.000" / "De R$ 100.000 até R$ 300.000", pela ordem dos tetos. */
export function rotuloDaFaixa(faixas: FaixaDeMargem[], indice: number): string {
    const ordenadas = [...faixas].sort((a, b) => a.ate - b.ate);
    const atual = ordenadas[indice];
    if (!atual) return '';
    const anterior = ordenadas[indice - 1];
    return anterior ? `De ${reais(anterior.ate)} até ${reais(atual.ate)}` : `Até ${reais(atual.ate)}`;
}

/** "5%" ou "R$ 1.000". */
export function rotuloDaMargem(tipo: TipoDeMargem, valor: number): string {
    return tipo === 'percent' ? `${valor.toLocaleString('pt-BR')}%` : reais(valor);
}
