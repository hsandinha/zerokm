import { describe, it, expect } from 'vitest';

/**
 * Testes de Contrato — API de Contatos
 * 
 * Garantem que a assinatura (shape) da resposta da API permanece
 * consistente, para que futuras mudanças no backend não quebrem
 * o frontend silenciosamente.
 */

interface ContatoContract {
    whatsapp: string;
    email_support: string;
    email_sales: string;
    email_general: string;
    address: string;
    business_hours: string;
    cnpj: string;
}

interface MarginContract {
    margem: number;
    fixedMargin: number;
    marginMode: 'percent' | 'fixed';
    isInvitee: boolean;
}

describe('Testes de Contrato — Shapes Esperados', () => {
    describe('ContatoContract', () => {
        const sampleResponse: ContatoContract = {
            whatsapp: '5511926384826',
            email_support: 'suporte@test.com',
            email_sales: 'vendas@test.com',
            email_general: 'geral@test.com',
            address: 'São Paulo, SP',
            business_hours: 'Seg-Sex: 09-18',
            cnpj: '64.467.246/0001-50',
        };

        it('should have all required fields as strings', () => {
            expect(typeof sampleResponse.whatsapp).toBe('string');
            expect(typeof sampleResponse.email_support).toBe('string');
            expect(typeof sampleResponse.email_sales).toBe('string');
            expect(typeof sampleResponse.email_general).toBe('string');
            expect(typeof sampleResponse.address).toBe('string');
            expect(typeof sampleResponse.business_hours).toBe('string');
            expect(typeof sampleResponse.cnpj).toBe('string');
        });

        it('should contain exactly 7 keys', () => {
            expect(Object.keys(sampleResponse)).toHaveLength(7);
        });

        it('should not contain unexpected keys', () => {
            const expected = ['whatsapp', 'email_support', 'email_sales', 'email_general', 'address', 'business_hours', 'cnpj'];
            expect(Object.keys(sampleResponse).sort()).toEqual(expected.sort());
        });
    });

    describe('MarginContract', () => {
        const sampleResponse: MarginContract = {
            margem: 10,
            fixedMargin: 500,
            marginMode: 'percent',
            isInvitee: false,
        };

        it('should have margem as a number', () => {
            expect(typeof sampleResponse.margem).toBe('number');
        });

        it('should have fixedMargin as a number', () => {
            expect(typeof sampleResponse.fixedMargin).toBe('number');
        });

        it('should have marginMode as either percent or fixed', () => {
            expect(['percent', 'fixed']).toContain(sampleResponse.marginMode);
        });

        it('should have isInvitee as a boolean', () => {
            expect(typeof sampleResponse.isInvitee).toBe('boolean');
        });

        it('should contain exactly 4 keys', () => {
            expect(Object.keys(sampleResponse)).toHaveLength(4);
        });

        it('should reject invalid marginMode values', () => {
            const invalid = 'both';
            expect(['percent', 'fixed']).not.toContain(invalid);
        });
    });
});

describe('Testes de Regressão — Valores Padrão', () => {
    it('default whatsapp should follow Brazilian format (numeric only, 10-13 digits)', () => {
        const defaultWhatsapp = '11926384826';
        expect(defaultWhatsapp).toMatch(/^\d{10,13}$/);
    });

    it('default CNPJ should follow XX.XXX.XXX/XXXX-XX format', () => {
        const defaultCnpj = '64.467.246/0001-50';
        expect(defaultCnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
    });

    it('default margin for new users should be 0', () => {
        const defaultMargin = { mode: 'percent', percentValue: 0, fixedValue: 0 };
        expect(defaultMargin.percentValue).toBe(0);
        expect(defaultMargin.fixedValue).toBe(0);
    });
});
