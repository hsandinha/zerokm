import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PaymentHistory } from '../../components/PaymentHistory';

/**
 * Testes — PaymentHistory Component
 * 
 * Testa a renderização do componente de histórico de pagamentos,
 * incluindo estados de loading, vazio e listagem.
 */

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('PaymentHistory Component', () => {

    it('deve exibir estado de carregamento inicialmente', () => {
        // Fetch nunca resolve = loading permanece
        mockFetch.mockReturnValue(new Promise(() => {}));

        render(React.createElement(PaymentHistory));
        expect(screen.getByText('Carregando pagamentos...')).toBeInTheDocument();
    });

    it('deve exibir estado vazio quando não há pagamentos', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([]),
        });

        render(React.createElement(PaymentHistory));

        // Aguardar fetch completar
        const emptyMessage = await screen.findByText('Nenhum pagamento registrado ainda.');
        expect(emptyMessage).toBeInTheDocument();
    });

    it('deve exibir o título "Meus Pagamentos"', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([]),
        });

        render(React.createElement(PaymentHistory));

        const title = await screen.findByText(/Meus Pagamentos/);
        expect(title).toBeInTheDocument();
    });

    it('deve exibir pagamento com cartão de crédito', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{
                id: '1',
                mpPaymentId: '123',
                method: 'credit_card',
                methodDetail: 'visa',
                status: 'approved',
                amount: 99.90,
                currency: 'BRL',
                installments: 3,
                billingType: 'monthly',
                planName: 'Plano Pro',
                createdAt: '2024-01-15T10:00:00Z',
            }]),
        });

        render(React.createElement(PaymentHistory));

        const planName = await screen.findByText(/Plano Pro/);
        expect(planName).toBeInTheDocument();

        expect(screen.getByText(/Visa/)).toBeInTheDocument();
        expect(screen.getByText('Aprovado')).toBeInTheDocument();
    });

    it('deve exibir pagamento PIX com status pendente', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{
                id: '2',
                mpPaymentId: '456',
                method: 'pix',
                status: 'pending',
                amount: 49.90,
                currency: 'BRL',
                billingType: 'monthly',
                planName: 'Plano Básico',
                createdAt: '2024-01-15T10:00:00Z',
            }]),
        });

        render(React.createElement(PaymentHistory));

        const planName = await screen.findByText(/Plano Básico/);
        expect(planName).toBeInTheDocument();

        expect(screen.getByText('Pendente')).toBeInTheDocument();
        expect(screen.getByText(/PIX/)).toBeInTheDocument();
    });

    it('deve exibir link do boleto para pagamento pendente', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{
                id: '3',
                mpPaymentId: '789',
                method: 'ticket',
                methodDetail: 'bolbradesco',
                status: 'pending',
                amount: 199.00,
                currency: 'BRL',
                billingType: 'annual',
                planName: 'Plano Enterprise',
                boletoUrl: 'https://mp.com/boleto/123',
                createdAt: '2024-01-15T10:00:00Z',
            }]),
        });

        render(React.createElement(PaymentHistory));

        const boletoLink = await screen.findByText(/Ver Boleto/);
        expect(boletoLink).toBeInTheDocument();
        expect(boletoLink.closest('a')).toHaveAttribute('href', 'https://mp.com/boleto/123');
        expect(boletoLink.closest('a')).toHaveAttribute('target', '_blank');
    });

    it('deve exibir badge de estornado para refunded', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{
                id: '4',
                mpPaymentId: '321',
                method: 'credit_card',
                methodDetail: 'master',
                status: 'refunded',
                amount: 99.90,
                currency: 'BRL',
                planName: 'Plano Pro',
                createdAt: '2024-01-15T10:00:00Z',
            }]),
        });

        render(React.createElement(PaymentHistory));

        const badge = await screen.findByText('Estornado');
        expect(badge).toBeInTheDocument();
    });

    it('deve exibir parcelas quando > 1', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{
                id: '5',
                mpPaymentId: '555',
                method: 'credit_card',
                methodDetail: 'elo',
                status: 'approved',
                amount: 299.70,
                currency: 'BRL',
                installments: 6,
                billingType: 'annual',
                planName: 'Plano Anual',
                createdAt: '2024-01-15T10:00:00Z',
            }]),
        });

        render(React.createElement(PaymentHistory));

        const installments = await screen.findByText(/6x/);
        expect(installments).toBeInTheDocument();
    });

    it('deve exibir (Anual) para billingType annual', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{
                id: '6',
                mpPaymentId: '666',
                method: 'pix',
                status: 'approved',
                amount: 999.00,
                currency: 'BRL',
                billingType: 'annual',
                planName: 'Plano Premium',
                createdAt: '2024-06-01T10:00:00Z',
            }]),
        });

        render(React.createElement(PaymentHistory));

        const annual = await screen.findByText(/Anual/);
        expect(annual).toBeInTheDocument();
    });

    it('deve formatar valor em reais corretamente', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{
                id: '7',
                mpPaymentId: '777',
                method: 'credit_card',
                status: 'approved',
                amount: 1299.90,
                currency: 'BRL',
                planName: 'Plano Ultra',
                createdAt: '2024-01-15T10:00:00Z',
            }]),
        });

        render(React.createElement(PaymentHistory));

        // Aguardar renderização
        await screen.findByText(/Plano Ultra/);

        // Verificar formatação — R$ 1.299,90
        const amount = screen.getByText(/1\.299,90/);
        expect(amount).toBeInTheDocument();
    });
});
