import { describe, expect, it } from 'vitest';
import { anoDivergente, lerAnoTexto, rotuloAno, textoDoAno } from '@/lib/utils/anoVeiculo';

describe('ano do veículo', () => {
    it('lê o texto do ano em vários formatos', () => {
        expect(lerAnoTexto('26/27')).toEqual({ anoFabricacao: 2026, anoModelo: 2027 });
        expect(lerAnoTexto('2026/2027')).toEqual({ anoFabricacao: 2026, anoModelo: 2027 });
        expect(lerAnoTexto('2027')).toEqual({ anoModelo: 2027 });
        expect(lerAnoTexto('')).toEqual({});
        expect(lerAnoTexto(undefined)).toEqual({});
    });

    it('monta o texto a partir dos números', () => {
        expect(textoDoAno(2026, 2027)).toBe('26/27');
        expect(textoDoAno(null, 2027)).toBe('2027');
        expect(textoDoAno(null, null)).toBe('');
    });

    it('os números mandam sobre o texto legado (caso do Argo 26/27 x 26/26)', () => {
        expect(rotuloAno({ ano: '26/27', anoFabricacao: 2026, anoModelo: 2026 })).toBe('26/26');
        expect(rotuloAno({ ano: '26/26', anoFabricacao: 2026, anoModelo: 2027 })).toBe('26/27');
    });

    it('usa o texto para completar a fabricação quando concorda com o modelo', () => {
        expect(rotuloAno({ ano: '26/27', anoModelo: 2027 })).toBe('26/27');
        expect(rotuloAno({ ano: '25/26', anoModelo: 2027 })).toBe('2027');
        expect(rotuloAno({ ano: '26/27' })).toBe('26/27');
        expect(rotuloAno({})).toBe('');
    });

    it('aponta texto e números que divergem', () => {
        expect(anoDivergente({ ano: '26/27', anoFabricacao: 2026, anoModelo: 2026 })).toBe(true);
        expect(anoDivergente({ ano: '26/27', anoFabricacao: 2026, anoModelo: 2027 })).toBe(false);
        expect(anoDivergente({ ano: '2027', anoFabricacao: 2026, anoModelo: 2027 })).toBe(false);
        expect(anoDivergente({ anoFabricacao: 2026, anoModelo: 2027 })).toBe(false);
    });
});
