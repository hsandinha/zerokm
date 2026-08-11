import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PricingCatalog } from '@/components/dealership/PricingCatalog';

const linha = (over: Record<string, unknown> = {}) => ({
    variationId: 'v1', marca: 'AUDI', modelo: 'A3 SEDAN ADVANCED 40 TFSI S TRONIC',
    opcionais: 'ITENS DE SERIE', anoModelo: 2026, anoFabricacao: 2026,
    combustivel: 'GASOLINA', cor: 'AZUL NAVARRA METALICO', transmissao: 'Automático',
    preco: 250000, frete: 0, quantidade: 2, prazo: 30, ativo: true, status: 'ativo',
    statusVeiculo: 'A faturar', observacoes: 'sem troca', updatedAt: '2026-08-01T12:00:00.000Z',
    ...over,
});

let requisicoes: Array<{ url: string; method: string; body: any }>;
let baixado: string;

const resposta = (linhas: any[]) => ({
    data: linhas,
    total: linhas.length,
    activeCount: linhas.length,
    totalQuantidade: 2,
    hasNextPage: false,
    concessionaria: { nome: 'AUDI CENTER', cidade: 'Aracaju', uf: 'SE', telefone: '79999999999' },
});

beforeEach(() => {
    requisicoes = [];
    baixado = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        requisicoes.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
        if (method === 'GET') return { ok: true, json: async () => resposta([linha()]) } as Response;
        return { ok: true, json: async () => ({ preco: 250000, prazo: 30, quantidade: 2, observacoes: 'nova obs', statusVeiculo: 'A faturar', ativo: true, status: 'ativo' }) } as Response;
    }));

    // Captura o CSV gerado sem tocar no disco.
    vi.stubGlobal('URL', {
        createObjectURL: (blob: Blob) => { (blob as any).text().then((t: string) => { baixado = t; }); return 'blob:csv'; },
        revokeObjectURL: () => {},
    } as any);
});

afterEach(() => vi.unstubAllGlobals());

const montar = async () => {
    render(<PricingCatalog />);
    await screen.findByText('A3 SEDAN ADVANCED 40 TFSI S TRONIC');
};

describe('PricingCatalog — prazo e observações', () => {
    it('mostra a coluna Observações no grid', async () => {
        await montar();
        expect(screen.getByRole('columnheader', { name: 'Observações' })).toBeInTheDocument();
        expect(screen.getByDisplayValue('sem troca')).toBeInTheDocument();
    });

    it('salva a observação editada na linha', async () => {
        await montar();
        const campo = screen.getByDisplayValue('sem troca');

        fireEvent.change(campo, { target: { value: 'aceita troca' } });
        fireEvent.blur(campo);

        await waitFor(() => {
            const patch = requisicoes.find(r => r.method === 'PATCH');
            expect(patch?.body).toMatchObject({ variationId: 'v1', observacoes: 'aceita troca' });
        });
    });

    it('envia string vazia ao apagar a observação', async () => {
        await montar();
        const campo = screen.getByDisplayValue('sem troca');

        fireEvent.change(campo, { target: { value: '' } });
        fireEvent.blur(campo);

        await waitFor(() => {
            const patch = requisicoes.find(r => r.method === 'PATCH');
            // Precisa chegar como '' — undefined seria descartado e a observação ficaria lá.
            expect(patch?.body.observacoes).toBe('');
        });
    });

    it('exporta prazo e observações no CSV', async () => {
        await montar();
        fireEvent.click(screen.getByRole('button', { name: /Baixar Planilha Base/ }));

        await waitFor(() => expect(baixado).toContain('prazo'));
        const [cabecalho, primeira] = baixado.split('\n');
        const colunas = cabecalho.split(';');
        expect(colunas).toContain('prazo');
        expect(colunas).toContain('observacoes');
        // O valor sai na posição da coluna prazo.
        expect(primeira.split(';')[colunas.indexOf('prazo')]).toBe('"30"');
        expect(primeira.split(';')[colunas.indexOf('observacoes')]).toBe('"sem troca"');
    });

    it('exporta prazo 0 como Pronta Entrega', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
            const method = init?.method ?? 'GET';
            requisicoes.push({ url, method, body: null });
            if (method === 'GET') return { ok: true, json: async () => resposta([linha({ prazo: 0 })]) } as Response;
            return { ok: true, json: async () => ({}) } as Response;
        }));

        await montar();
        fireEvent.click(screen.getByRole('button', { name: /Baixar Planilha Base/ }));

        await waitFor(() => expect(baixado).toContain('Pronta Entrega'));
    });
});
