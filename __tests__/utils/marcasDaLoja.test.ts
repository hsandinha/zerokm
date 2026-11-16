// Concessionária sem marca não vê nada; login de loja com teste grátis vale a loja.
import { describe, expect, it } from 'vitest';
import { lojaTemMarca, perfilDaConsulta } from '@/lib/utils/marcasDaLoja';

describe('lojaTemMarca', () => {
    it('sem marca em nenhum formato: não tem', () => {
        expect(lojaTemMarca(null)).toBe(false);
        expect(lojaTemMarca({})).toBe(false);
        expect(lojaTemMarca({ marcaIds: [], marcas: [], marcaId: null, marca: '' })).toBe(false);
        expect(lojaTemMarca({ marcas: ['  '] })).toBe(false);
    });

    it('formato novo ou antigo: tem', () => {
        expect(lojaTemMarca({ marcaIds: ['a'] })).toBe(true);
        expect(lojaTemMarca({ marcas: ['FORD'] })).toBe(true);
        expect(lojaTemMarca({ marcaId: 'a' })).toBe(true);
        expect(lojaTemMarca({ marca: 'FORD' })).toBe(true);
    });
});

describe('perfilDaConsulta', () => {
    it('teste grátis de quem é login de concessionária vira concessionária', () => {
        expect(perfilDaConsulta('gratis', { dealershipId: 'loja1' })).toBe('concessionaria');
    });

    it('lojista comum e equipe ficam como estão', () => {
        expect(perfilDaConsulta('gratis', {})).toBe('gratis');
        expect(perfilDaConsulta('gratis', null)).toBe('gratis');
        expect(perfilDaConsulta('cliente', { dealershipId: 'loja1' })).toBe('cliente');
        expect(perfilDaConsulta('administrador', { dealershipId: 'loja1' })).toBe('administrador');
    });
});
