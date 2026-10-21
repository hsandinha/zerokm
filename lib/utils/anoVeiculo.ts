/**
 * Ano do veículo num lugar só.
 *
 * A variação guarda o ano duas vezes: os números (anoFabricacao/anoModelo),
 * que valem para filtro, ordenação, índice único e importação das
 * concessionárias, e o texto `ano` ("26/27"), herdado das planilhas antigas.
 * Cada tela lia um dos dois e, quando divergiam, o mesmo carro aparecia 26/27
 * no Catálogo e 26/26 no Estoque. Agora todas as telas usam `rotuloAno`, que
 * dá preferência aos números, e todo salvamento regrava o texto a partir deles.
 */

export interface AnoInfo {
    ano?: string | null;
    anoFabricacao?: number | null;
    anoModelo?: number | null;
}

function anoCompleto(valor: string): number | undefined {
    const digitos = valor.replace(/\D/g, '');
    if (!digitos) return undefined;
    const ano = digitos.length <= 2 ? 2000 + Number(digitos) : Number(digitos.slice(0, 4));
    return Number.isFinite(ano) && ano >= 1900 && ano <= 2100 ? ano : undefined;
}

/** "26/27" → fab 2026, modelo 2027. "2027" → só modelo. */
export function lerAnoTexto(valor: unknown): { anoFabricacao?: number; anoModelo?: number } {
    const texto = typeof valor === 'string' ? valor.trim() : typeof valor === 'number' ? String(valor) : '';
    if (!texto) return {};
    const partes = texto.split(/[/-]/).map(anoCompleto).filter((a): a is number => Boolean(a));
    if (partes.length >= 2) return { anoFabricacao: partes[0], anoModelo: partes[1] };
    const unico = anoCompleto(texto);
    return unico ? { anoModelo: unico } : {};
}

/** Texto canônico a partir dos números: 2026/2027 → "26/27"; só modelo → "2027". */
export function textoDoAno(anoFabricacao?: number | null, anoModelo?: number | null): string {
    if (anoFabricacao && anoModelo) return `${String(anoFabricacao).slice(-2)}/${String(anoModelo).slice(-2)}`;
    if (anoModelo) return String(anoModelo);
    return '';
}

/** O ano que todas as telas mostram. */
export function rotuloAno(v: AnoInfo): string {
    if (v.anoFabricacao && v.anoModelo) return textoDoAno(v.anoFabricacao, v.anoModelo);
    const doTexto = lerAnoTexto(v.ano);
    if (v.anoModelo) {
        // Só o modelo nos números: o texto completa a fabricação se concordar.
        if (doTexto.anoFabricacao && doTexto.anoModelo === v.anoModelo) return textoDoAno(doTexto.anoFabricacao, doTexto.anoModelo);
        return String(v.anoModelo);
    }
    return (v.ano || '').trim();
}

/** O texto `ano` diz uma coisa e os números outra (dado legado a corrigir). */
export function anoDivergente(v: AnoInfo): boolean {
    if (!v.ano || !v.anoModelo) return false;
    const doTexto = lerAnoTexto(v.ano);
    if (!doTexto.anoModelo) return false;
    if (doTexto.anoModelo !== v.anoModelo) return true;
    return Boolean(doTexto.anoFabricacao && v.anoFabricacao && doTexto.anoFabricacao !== v.anoFabricacao);
}
