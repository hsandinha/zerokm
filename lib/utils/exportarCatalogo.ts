import { rotuloAno } from '@/lib/utils/anoVeiculo';

/**
 * Exportação do catálogo em CSV. As primeiras colunas são as mesmas da
 * importação, então o arquivo exportado, editado no Excel, volta pelo Importar.
 * Separador ";" e BOM para o Excel em português abrir com acento e colunas certas.
 */

export const CABECALHO_EXPORTACAO = [
    'Marca', 'Modelo', 'Ano', 'Combustível', 'Cor', 'Câmbio', 'Opcionais',
    'Tipo', 'Cilindrada', 'Código FIPE', 'Descrição FIPE', 'Motor', 'Carroceria', 'Portas',
    'Foto', 'Anúncios ativos',
];

export const BOM = '﻿';

type VariacaoExportada = {
    marca?: string; modelo?: string; ano?: string | null; anoFabricacao?: number | null; anoModelo?: number | null;
    combustivel?: string; cor?: string; transmissao?: string; opcionais?: string; opcionaisPadrao?: string[];
    tipoVeiculo?: string; cilindrada?: number; codigoFipe?: string; descricaoFipe?: string; motor?: string;
    carroceria?: string; portas?: number; imagemUrl?: string;
};

export function linhaDaExportacao(v: VariacaoExportada, anunciosAtivos: number): Array<string | number> {
    return [
        v.marca || '',
        v.modelo || '',
        rotuloAno(v),
        v.combustivel || '',
        v.cor || '',
        v.transmissao || '',
        v.opcionais || (v.opcionaisPadrao || []).join(', '),
        v.tipoVeiculo || 'carro',
        v.cilindrada ?? '',
        v.codigoFipe || '',
        v.descricaoFipe || '',
        v.motor || '',
        v.carroceria || '',
        v.portas ?? '',
        v.imagemUrl || '',
        anunciosAtivos,
    ];
}

/** Célula do CSV: aspas quando precisa e sem virar fórmula no Excel. */
export function celulaCsv(valor: string | number): string {
    let texto = String(valor ?? '');
    if (/^[=+@]/.test(texto)) texto = `'${texto}`;
    if (/[";\r\n]/.test(texto) || texto !== texto.trim()) return `"${texto.replace(/"/g, '""')}"`;
    return texto;
}

export function linhasCsv(linhas: Array<Array<string | number>>): string {
    return linhas.map(linha => linha.map(celulaCsv).join(';')).join('\r\n') + (linhas.length ? '\r\n' : '');
}

export function nomeDoArquivo(data = new Date()) {
    const dia = new Date(data.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return `catalogo-cnv-${dia}.csv`;
}
