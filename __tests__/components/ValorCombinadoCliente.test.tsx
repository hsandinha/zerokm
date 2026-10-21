import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { ValorCombinadoCliente } from '../../components/admin/ValorCombinadoCliente';
import { ClienteFinanceiro } from '../../components/admin/ClienteFinanceiro';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const resumo = (over: Record<string, unknown> = {}) => ({
    plano: { id: 'p1', nome: 'Plano 1 - ACESSO TOTAL 0KM', periodicidade: 'monthly', tabela: 699 },
    valorCombinado: null,
    valorAtual: 699,
    telasExtras: 0,
    valorPorTela: 0,
    proximaCobranca: 699,
    boletosEmAberto: 0,
    ...over,
});
const responder = (data: unknown, ok = true) => mockFetch.mockResolvedValueOnce({ ok, json: async () => data });

beforeEach(() => mockFetch.mockReset());

describe('ValorCombinadoCliente', () => {
    it('mostra o preço da tabela quando não há valor combinado', async () => {
        responder(resumo());
        render(React.createElement(ValorCombinadoCliente, { userId: 'u1' }));
        expect(await screen.findByText('Preço da tabela')).toBeTruthy();
        expect(screen.getByText('Combinar outro valor')).toBeTruthy();
        expect(mockFetch.mock.calls[0][0]).toBe('/api/admin/clientes/u1/valor-combinado');
    });

    it('mostra o valor combinado e a soma das telas extras', async () => {
        responder(resumo({
            valorCombinado: { valor: 500, vale: true, atualizadoPor: 'equipe@cnv.com.br' },
            valorAtual: 500, telasExtras: 2, valorPorTela: 99, proximaCobranca: 698,
        }));
        render(React.createElement(ValorCombinadoCliente, { userId: 'u1' }));
        expect(await screen.findByText('Valor combinado')).toBeTruthy();
        expect(screen.getByText(/R\$ 698,00/)).toBeTruthy();
        expect(screen.getByText('Voltar ao preço da tabela')).toBeTruthy();
    });

    it('salva o valor digitado no formato brasileiro', async () => {
        responder(resumo());
        render(React.createElement(ValorCombinadoCliente, { userId: 'u1' }));
        fireEvent.click(await screen.findByText('Combinar outro valor'));
        const campo = screen.getByPlaceholderText('Ex.: 500,00') as HTMLInputElement;
        fireEvent.change(campo, { target: { value: '1.250,50' } });
        responder({ ...resumo({ valorCombinado: { valor: 1250.5, vale: true }, valorAtual: 1250.5, proximaCobranca: 1250.5 }), assinaturaCartao: null });
        fireEvent.click(screen.getByText('Salvar valor'));
        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
        const [url, opcoes] = mockFetch.mock.calls[1];
        expect(url).toBe('/api/admin/clientes/u1/valor-combinado');
        expect(opcoes.method).toBe('PUT');
        expect(JSON.parse(opcoes.body).valor).toBe(1250.5);
    });

    it('avisa quando o cliente não tem plano', async () => {
        responder(resumo({ plano: null, valorAtual: null, proximaCobranca: null }));
        render(React.createElement(ValorCombinadoCliente, { userId: 'u1' }));
        expect(await screen.findByText(/não tem plano mensal ativo/)).toBeTruthy();
    });
});

describe('ClienteFinanceiro: correção de valor', () => {
    it('oferece "Corrigir valor" só em registro manual', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [
            { id: 'm1', mpPaymentId: 'MANUAL-1', plano: 'Plano 1', valor: 699, status: 'approved', criadoEm: '2026-10-19T03:00:00.000Z', boletoUrl: null, boletoBarcode: null, podeEditarValor: true, email: { enviadoEm: null, para: 'a@b.com', id: null, erro: null, situacao: null } },
            { id: 'b1', mpPaymentId: '123', plano: 'Plano 1', valor: 699, status: 'pending', criadoEm: '2026-10-19T03:00:00.000Z', boletoUrl: 'https://mp/1', boletoBarcode: '1', podeEditarValor: false, email: { enviadoEm: null, para: 'a@b.com', id: null, erro: null, situacao: null } },
        ] }) });
        render(React.createElement(ClienteFinanceiro, { userId: 'u1' }));
        await screen.findAllByText('R$ 699,00');
        expect(screen.getAllByText('Corrigir valor')).toHaveLength(1);
    });
});
