import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { ClienteFinanceiro } from '../../components/admin/ClienteFinanceiro';

/**
 * Aba Financeiro do cliente no CRM. O que importa: o atendente precisa ver se o
 * e-mail do boleto foi entregue e conseguir reabrir ou reenviar.
 */
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const cobranca = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    mpPaymentId: '111',
    plano: 'Acesso Total 0KM',
    valor: 699,
    status: 'pending',
    criadoEm: '2026-09-22T03:00:00.000Z',
    boletoUrl: 'https://mp/ticket/111',
    boletoBarcode: '23793.38128 60007',
    email: { enviadoEm: '2026-09-22T03:00:00.000Z', para: 'loja@cnv.com.br', id: 'email-1', erro: null, situacao: 'delivered' },
    ...over,
});

const responder = (data: any[]) => mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data }) });

beforeEach(() => mockFetch.mockReset());

describe('ClienteFinanceiro', () => {
    it('busca as cobranças do cliente pelo id', async () => {
        responder([]);
        render(React.createElement(ClienteFinanceiro, { userId: 'user-123' }));
        await waitFor(() => expect(mockFetch).toHaveBeenCalled());
        expect(mockFetch.mock.calls[0][0]).toContain('userId=user-123');
    });

    it('mostra aviso quando o cliente não tem cobrança', async () => {
        responder([]);
        render(React.createElement(ClienteFinanceiro, { userId: 'u1' }));
        expect(await screen.findByText('Nenhuma cobrança registrada para este cliente.')).toBeInTheDocument();
    });

    it('mostra valor, situação do pagamento e entrega do e-mail', async () => {
        responder([cobranca()]);
        render(React.createElement(ClienteFinanceiro, { userId: 'u1' }));
        expect(await screen.findByText('R$ 699,00')).toBeInTheDocument();
        expect(screen.getByText('Aguardando')).toBeInTheDocument();
        expect(screen.getByText('Entregue')).toBeInTheDocument();
        expect(screen.getByText('loja@cnv.com.br')).toBeInTheDocument();
    });

    it('avisa quando o e-mail voltou', async () => {
        responder([cobranca({ email: { enviadoEm: '2026-09-22T03:00:00.000Z', para: 'errado@x.com', id: 'e', erro: null, situacao: 'bounced' } })]);
        render(React.createElement(ClienteFinanceiro, { userId: 'u1' }));
        expect(await screen.findByText('Voltou')).toBeInTheDocument();
    });

    it('avisa quando nunca foi enviado', async () => {
        responder([cobranca({ email: { enviadoEm: null, para: '', id: null, erro: null, situacao: null } })]);
        render(React.createElement(ClienteFinanceiro, { userId: 'u1' }));
        expect(await screen.findByText('Não enviado')).toBeInTheDocument();
        expect(screen.getByText('nunca enviado')).toBeInTheDocument();
    });

    it('oferece abrir o boleto e reenviar; cobrança sem boleto não mostra ações', async () => {
        responder([cobranca()]);
        const { rerender } = render(React.createElement(ClienteFinanceiro, { userId: 'u1' }));
        expect(await screen.findByText('Abrir boleto')).toHaveAttribute('href', 'https://mp/ticket/111');
        expect(screen.getByText('Reenviar e-mail')).toBeInTheDocument();

        responder([cobranca({ id: 'c2', boletoUrl: null, boletoBarcode: null })]);
        rerender(React.createElement(ClienteFinanceiro, { userId: 'u2' }));
        await waitFor(() => expect(screen.queryByText('Abrir boleto')).not.toBeInTheDocument());
    });

    it('reenvia para o e-mail informado e recarrega a lista', async () => {
        responder([cobranca()]);
        vi.stubGlobal('prompt', () => 'financeiro@loja.com.br');
        render(React.createElement(ClienteFinanceiro, { userId: 'u1' }));

        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, para: 'financeiro@loja.com.br' }) });
        responder([cobranca({ email: { enviadoEm: '2026-09-22T12:00:00.000Z', para: 'financeiro@loja.com.br', id: 'email-2', erro: null, situacao: 'sent' } })]);

        fireEvent.click(await screen.findByText('Reenviar e-mail'));

        await waitFor(() => expect(screen.getByText('Boleto reenviado para financeiro@loja.com.br.')).toBeInTheDocument());
        const chamadaReenvio = mockFetch.mock.calls[1];
        expect(chamadaReenvio[0]).toBe('/api/admin/cobrancas/c1/reenviar');
        expect(JSON.parse(chamadaReenvio[1].body)).toEqual({ email: 'financeiro@loja.com.br' });
        expect(await screen.findByText('financeiro@loja.com.br')).toBeInTheDocument();
    });

    it('mostra o erro quando o reenvio falha', async () => {
        responder([cobranca()]);
        vi.stubGlobal('prompt', () => 'loja@cnv.com.br');
        render(React.createElement(ClienteFinanceiro, { userId: 'u1' }));
        mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Falha ao enviar o e-mail' }) });

        fireEvent.click(await screen.findByText('Reenviar e-mail'));
        expect(await screen.findByText('Falha ao enviar o e-mail')).toBeInTheDocument();
    });
});
