// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mp } = vi.hoisted(() => ({ mp: { posted: [] as any[] } }));

vi.mock('@/lib/mercadopago', () => ({
    mpPost: async (path: string, body: any) => {
        mp.posted.push({ path, body });
        return { ok: true, status: 201, data: { id: 123, status: 'pending', transaction_details: { external_resource_url: 'https://mp/ticket' }, barcode: { content: '23793...' } } };
    },
}));

import { createBoletoPayment, getPayerIdentification, validateBoletoProfile } from '@/lib/services/boletoService';

// CPF e CNPJ válidos de teste (passam no dígito verificador).
const CPF = '52998224725';
const CNPJ = '11222333000181';

const endereco = { zipCode: '30110-000', street: 'Av. Afonso Pena', number: '1000', neighborhood: 'Centro', city: 'Belo Horizonte', state: 'MG' };
const loja = (cpf: string) => ({ _id: 'u1', email: 'loja@cnv.com.br', displayName: 'Loja Teste', cpf, address: endereco, phoneNumber: '31999998888' });
const plan = { _id: 'p1', name: 'Acesso Total 0KM', description: 'Plano', price: 699, annualPrice: null, invitePrice: 0, type: 'monthly' };

beforeEach(() => { mp.posted = []; });

describe('documento do pagador no boleto', () => {
    it('reconhece CPF e CNPJ, e recusa documento inválido', () => {
        expect(getPayerIdentification(CPF)).toEqual({ type: 'CPF', number: CPF });
        expect(getPayerIdentification('11.222.333/0001-81')).toEqual({ type: 'CNPJ', number: CNPJ });
        expect(getPayerIdentification('11111111111')).toBeNull();
        expect(getPayerIdentification('123')).toBeNull();
        expect(getPayerIdentification(undefined)).toBeNull();
    });

    it('loja com CNPJ passa na validação de perfil (regressão: 17 dos 24 eram barrados)', () => {
        expect(validateBoletoProfile(loja(CNPJ))).toBeNull();
        expect(validateBoletoProfile(loja(CPF))).toBeNull();
    });

    it('sem documento válido segue barrado, com a mensagem certa', () => {
        expect(validateBoletoProfile(loja(''))).toBe('CPF ou CNPJ válido obrigatório para gerar boleto.');
        expect(validateBoletoProfile({ ...loja(CNPJ), address: { ...endereco, state: '' } })).toBe('UF obrigatória para gerar boleto.');
    });

    it('envia identification CNPJ ao Mercado Pago quando o assinante é PJ', async () => {
        await createBoletoPayment({
            user: loja(CNPJ), plan, billingType: 'monthly', inviteesCount: 0,
            externalReference: 'uid:p1:monthly:boleto-renewal:2026-09-26',
            expirationDate: new Date('2026-09-26T23:59:59Z'), metadataType: 'boleto-renewal',
        } as any);
        expect(mp.posted[0].body.payer.identification).toEqual({ type: 'CNPJ', number: CNPJ });
        expect(mp.posted[0].body.payment_method_id).toBe('bolbradesco');
    });

    it('mantém CPF para pessoa física', async () => {
        await createBoletoPayment({
            user: loja(CPF), plan, billingType: 'monthly', inviteesCount: 0,
            externalReference: 'uid:p1:monthly:boleto-renewal:2026-09-26',
            expirationDate: new Date('2026-09-26T23:59:59Z'), metadataType: 'boleto-renewal',
        } as any);
        expect(mp.posted[0].body.payer.identification).toEqual({ type: 'CPF', number: CPF });
    });
});
