import { describe, expect, it } from 'vitest';
import { combinadoValePara, lerValorEmReais, precoDoCliente, precoTabela } from '@/lib/utils/valorCombinado';

const plano = { _id: 'p1', price: 699, annualPrice: 7188 };

describe('precoTabela', () => {
    it('usa o anual quando existe', () => {
        expect(precoTabela(plano, 'annual')).toBe(7188);
        expect(precoTabela(plano, 'monthly')).toBe(699);
        expect(precoTabela({ price: 699 }, 'annual')).toBe(699);
    });
});

describe('precoDoCliente', () => {
    it('usa o combinado do mesmo plano e periodicidade', () => {
        const cliente = { valorCombinado: { valor: 500, periodicidade: 'monthly' as const, planId: 'p1' } };
        expect(precoDoCliente(plano, 'monthly', cliente)).toEqual({ valor: 500, tabela: 699, combinado: true });
    });

    it('volta para a tabela em outro plano ou outra periodicidade', () => {
        const cliente = { valorCombinado: { valor: 500, periodicidade: 'monthly' as const, planId: 'p1' } };
        expect(precoDoCliente({ ...plano, _id: 'p2' }, 'monthly', cliente).valor).toBe(699);
        expect(precoDoCliente(plano, 'annual', cliente).valor).toBe(7188);
    });

    it('ignora combinado sem plano, zerado ou ausente', () => {
        expect(precoDoCliente(plano, 'monthly', { valorCombinado: { valor: 500 } }).combinado).toBe(false);
        expect(precoDoCliente(plano, 'monthly', { valorCombinado: { valor: 0, planId: 'p1' } }).combinado).toBe(false);
        expect(precoDoCliente(plano, 'monthly', null).valor).toBe(699);
        expect(combinadoValePara(undefined, plano, 'monthly')).toBe(false);
    });

    it('aceita ObjectId como planId', () => {
        const id = { toString: () => 'p1' };
        expect(precoDoCliente({ ...plano, _id: id }, 'monthly', { valorCombinado: { valor: 450.5, planId: id } }).valor).toBe(450.5);
    });
});

describe('lerValorEmReais', () => {
    it('entende o formato brasileiro', () => {
        expect(lerValorEmReais('R$ 1.234,56')).toBe(1234.56);
        expect(lerValorEmReais('500')).toBe(500);
        expect(lerValorEmReais('499,9')).toBe(499.9);
        expect(lerValorEmReais('499.90')).toBe(499.9);
        expect(lerValorEmReais(350)).toBe(350);
        expect(lerValorEmReais('1.500')).toBe(1500);
    });

    it('devolve null quando não dá para ler', () => {
        expect(lerValorEmReais('')).toBeNull();
        expect(lerValorEmReais('abc')).toBeNull();
        expect(lerValorEmReais(undefined)).toBeNull();
    });
});
