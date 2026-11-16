/**
 * Campos de valor (R$, km, preço): formatação enquanto a pessoa digita, no padrão
 * brasileiro. "10000" vira "10.000"; "10000,5" vira "10.000,5". O ponto é sempre
 * separador de milhar e a vírgula é a casa decimal.
 *
 * O texto do campo fica formatado no estado da tela; para gravar, use `lerValor`,
 * que entende tanto "10.000,50" quanto um número antigo em texto ("699.9").
 */

/** Só dígitos e uma vírgula, milhar com ponto, no máximo `decimais` casas depois da vírgula. */
export function formatarAoDigitar(texto: string, decimais = 2): string {
    const limpo = String(texto ?? '').replace(/[^\d,]/g, '');
    const virgula = limpo.indexOf(',');
    let inteiro = virgula >= 0 ? limpo.slice(0, virgula) : limpo;
    let fracao: string | null = null;
    if (decimais > 0 && virgula >= 0) {
        // Uma segunda vírgula é descartada: os dígitos dela continuam na fração.
        fracao = limpo.slice(virgula + 1).replace(/,/g, '').slice(0, decimais);
    }
    inteiro = inteiro.replace(/,/g, '').replace(/^0+(?=\d)/, '');
    if (inteiro === '' && fracao !== null) inteiro = '0';
    const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return fracao !== null ? `${agrupado},${fracao}` : agrupado;
}

/**
 * Lê o texto do campo como número. Aceita "10.000", "10.000,50", "R$ 72.900,00"
 * e também número antigo em texto ("699.9", "1500"). Vazio ou inválido: null.
 */
export function lerValor(texto: string | number | null | undefined): number | null {
    if (texto === null || texto === undefined) return null;
    if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
    const s = texto.replace(/[^\d,.-]/g, '');
    if (!/\d/.test(s)) return null;
    let normal: string;
    if (s.includes(',')) {
        normal = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes('.')) {
        // Só pontos: milhar quando todo grupo depois do primeiro tem 3 dígitos ("10.000"),
        // senão é ponto decimal de um número em texto ("699.9").
        const grupos = s.split('.');
        const ehMilhar = grupos.length > 1 && grupos.slice(1).every(g => g.length === 3);
        normal = ehMilhar ? grupos.join('') : s;
    } else {
        normal = s;
    }
    const n = Number(normal);
    return Number.isFinite(n) ? n : null;
}

/** Número para o texto inicial do campo: 10000 vira "10.000", 699.9 vira "699,90". */
export function valorParaCampo(n: number | string | null | undefined, decimais = 2): string {
    const numero = typeof n === 'string' ? lerValor(n) : n;
    if (numero === null || numero === undefined || !Number.isFinite(numero)) return '';
    const sinal = numero < 0 ? '-' : '';
    const abs = Math.abs(numero);
    if (decimais === 0 || Number.isInteger(abs)) {
        return sinal + formatarAoDigitar(String(Math.round(abs)), 0);
    }
    const [inteiro, fracao] = abs.toFixed(decimais).split('.');
    return `${sinal}${formatarAoDigitar(inteiro, 0)},${fracao}`;
}

/** Quantos caracteres que contam (dígitos e vírgula) há antes da posição `pos`. */
function significativosAntes(texto: string, pos: number): number {
    return texto.slice(0, pos).replace(/[^\d,]/g, '').length;
}

/** Posição no texto formatado depois de `n` caracteres que contam. */
function posicaoDepoisDe(texto: string, n: number): number {
    if (n <= 0) return 0;
    let vistos = 0;
    for (let i = 0; i < texto.length; i++) {
        if (/[\d,]/.test(texto[i])) vistos++;
        if (vistos >= n) return i + 1;
    }
    return texto.length;
}

export type EdicaoDoCampo = {
    /** Texto como ficou no campo depois da tecla (antes de formatar). */
    bruto: string;
    /** Posição do cursor no texto bruto. */
    cursor: number;
    /** Texto formatado que estava no campo antes da tecla. */
    anterior: string;
    /** `inputType` do evento (insertText, deleteContentBackward...), se o navegador informar. */
    tipo?: string;
    /** Caractere digitado, se houver. */
    digitado?: string | null;
    decimais?: number;
};

/**
 * Aplica uma edição e devolve o texto formatado e onde o cursor deve ficar.
 * Cuida de três detalhes que a formatação simples estraga:
 * - ponto digitado vira vírgula (quem digita "10.5" quer dez e meio);
 * - apagar logo depois de um ponto de milhar apaga o dígito anterior, em vez de nada;
 * - o cursor continua depois do mesmo dígito, mesmo com pontos entrando e saindo.
 */
export function aplicarEdicao({ bruto, cursor, anterior, tipo, digitado, decimais = 2 }: EdicaoDoCampo): { texto: string; cursor: number } {
    let texto = bruto;
    let pos = cursor;

    if (decimais > 0 && digitado === '.' && texto[pos - 1] === '.' && !anterior.includes(',')) {
        texto = `${texto.slice(0, pos - 1)},${texto.slice(pos)}`;
    }

    let formatado = formatarAoDigitar(texto, decimais);

    // Apagou só o ponto de milhar: o texto formatado não muda. Apaga o dígito vizinho.
    if (formatado === anterior && tipo === 'deleteContentBackward' && pos > 0) {
        texto = texto.slice(0, pos - 1) + texto.slice(pos);
        pos -= 1;
        formatado = formatarAoDigitar(texto, decimais);
    } else if (formatado === anterior && tipo === 'deleteContentForward' && pos < texto.length) {
        texto = texto.slice(0, pos) + texto.slice(pos + 1);
        formatado = formatarAoDigitar(texto, decimais);
    }

    const n = significativosAntes(texto, pos);
    // Zeros à esquerda removidos pela formatação não contam.
    const zerosRemovidos = (texto.replace(/[^\d,]/g, '').match(/^0+(?=\d)/)?.[0].length) ?? 0;
    const alvo = Math.max(0, n - Math.min(zerosRemovidos, n));
    return { texto: formatado, cursor: Math.min(posicaoDepoisDe(formatado, alvo), formatado.length) };
}
