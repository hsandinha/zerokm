import { describe, expect, it } from 'vitest';
import { CABECALHO_EXPORTACAO, celulaCsv, linhaDaExportacao, linhasCsv, nomeDoArquivo } from '@/lib/utils/exportarCatalogo';

describe('exportação do catálogo', () => {
    it('começa pelas colunas da importação', () => {
        expect(CABECALHO_EXPORTACAO.slice(0, 7)).toEqual(['Marca', 'Modelo', 'Ano', 'Combustível', 'Cor', 'Câmbio', 'Opcionais']);
    });

    it('usa o mesmo ano das telas', () => {
        const linha = linhaDaExportacao({ marca: 'FIAT', modelo: 'Argo Drive', ano: '26/26', anoFabricacao: 2026, anoModelo: 2027, cor: 'Branco' }, 3);
        expect(linha[2]).toBe('26/27');
        expect(linha[15]).toBe(3);
        expect(linha).toHaveLength(CABECALHO_EXPORTACAO.length);
    });

    it('protege separador, aspas e fórmula', () => {
        expect(celulaCsv('Ar; Direção')).toBe('"Ar; Direção"');
        expect(celulaCsv('Teto "solar"')).toBe('"Teto ""solar"""');
        expect(celulaCsv('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
        expect(celulaCsv(12)).toBe('12');
    });

    it('monta linhas com ponto e vírgula e quebra do Windows', () => {
        expect(linhasCsv([['a', 'b'], ['c', 1]])).toBe('a;b\r\nc;1\r\n');
        expect(linhasCsv([])).toBe('');
    });

    it('nomeia o arquivo com a data de Brasília', () => {
        expect(nomeDoArquivo(new Date('2026-10-21T02:00:00Z'))).toBe('catalogo-cnv-2026-10-20.csv');
    });
});
