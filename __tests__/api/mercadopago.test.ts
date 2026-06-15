import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes — lib/mercadopago.ts
 * 
 * Testa o utilitário centralizado de chamadas à API do Mercado Pago.
 * Usa mock do fetch global para simular respostas da API.
 */

// Mock do fetch global
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Precisa estar antes dos imports para o mock funcionar
vi.stubEnv('MP_ACCESS_TOKEN', 'TEST-token-123');

import { mpGet, mpPost, mpPut, getPaymentMethods, getPayment, createPreference } from '../../lib/mercadopago';

describe('lib/mercadopago — Utilitário Centralizado', () => {

    beforeEach(() => {
        mockFetch.mockReset();
    });

    // ═══════════════════════════════════════
    // mpGet
    // ═══════════════════════════════════════
    describe('mpGet', () => {
        it('deve enviar GET com header Authorization correto', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ id: 'pay_123' }),
            });

            const result = await mpGet('/v1/payments/123');

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.mercadopago.com/v1/payments/123',
                {
                    headers: {
                        Authorization: 'Bearer TEST-token-123',
                    },
                }
            );
            expect(result.ok).toBe(true);
            expect(result.status).toBe(200);
            expect(result.data.id).toBe('pay_123');
        });

        it('deve retornar ok: false quando a API retorna erro', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({ message: 'Not found' }),
            });

            const result = await mpGet('/v1/payments/999');

            expect(result.ok).toBe(false);
            expect(result.status).toBe(404);
        });
    });

    // ═══════════════════════════════════════
    // mpPost
    // ═══════════════════════════════════════
    describe('mpPost', () => {
        it('deve enviar POST com body JSON e headers corretos', async () => {
            const body = { transaction_amount: 100 };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 201,
                json: async () => ({ id: 'pay_456', status: 'approved' }),
            });

            const result = await mpPost('/v1/payments', body);

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.mercadopago.com/v1/payments',
                {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer TEST-token-123',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                }
            );
            expect(result.ok).toBe(true);
            expect(result.data.status).toBe('approved');
        });

        it('deve retornar erro quando o pagamento é recusado', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({ message: 'cc_rejected_other_reason' }),
            });

            const result = await mpPost('/v1/payments', {});
            expect(result.ok).toBe(false);
            expect(result.status).toBe(400);
        });
    });

    // ═══════════════════════════════════════
    // mpPut
    // ═══════════════════════════════════════
    describe('mpPut', () => {
        it('deve enviar PUT com body JSON', async () => {
            const body = { status: 'cancelled' };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ id: 'pay_789', status: 'cancelled' }),
            });

            const result = await mpPut('/v1/payments/789', body);

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.mercadopago.com/v1/payments/789',
                {
                    method: 'PUT',
                    headers: {
                        Authorization: 'Bearer TEST-token-123',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                }
            );
            expect(result.ok).toBe(true);
        });
    });

    // ═══════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════
    describe('getPaymentMethods', () => {
        it('deve chamar /v1/payment_methods', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ([{ id: 'visa' }, { id: 'pix' }]),
            });

            const result = await getPaymentMethods();
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.mercadopago.com/v1/payment_methods',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer TEST-token-123',
                    }),
                })
            );
            expect(result.ok).toBe(true);
        });
    });

    describe('getPayment', () => {
        it('deve buscar pagamento por ID numérico', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ id: 12345, status: 'approved' }),
            });

            const result = await getPayment(12345);
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.mercadopago.com/v1/payments/12345',
                expect.any(Object)
            );
            expect(result.data.status).toBe('approved');
        });

        it('deve buscar pagamento por ID string', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ id: '67890' }),
            });

            const result = await getPayment('67890');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.mercadopago.com/v1/payments/67890',
                expect.any(Object)
            );
            expect(result.ok).toBe(true);
        });
    });

    describe('createPreference', () => {
        it('deve criar preferência no Checkout Pro', async () => {
            const preference = {
                items: [{ title: 'Plano Pro', quantity: 1, unit_price: 99.90 }],
                payer: { email: 'test@test.com' },
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 201,
                json: async () => ({
                    id: 'pref_123',
                    init_point: 'https://mercadopago.com.br/checkout/v1/redirect?pref_id=pref_123',
                    sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=pref_123',
                }),
            });

            const result = await createPreference(preference);

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.mercadopago.com/checkout/preferences',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify(preference),
                })
            );
            expect(result.ok).toBe(true);
            expect(result.data.init_point).toContain('mercadopago');
            expect(result.data.sandbox_init_point).toContain('sandbox');
        });
    });
});
