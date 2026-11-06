// Cartão "Eventos para a Meta" da Configuração (wa/components/conversoes-meta.tsx):
// mostra a situação e os últimos eventos com o motivo de quem não foi, abre o
// formulário em modal, testa com o que está no formulário e nunca recebe o
// token de volta (só "salvo").
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EventosParaMeta } from '@wa/components/conversoes-meta';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const CONFIG = {
    ativo: true,
    datasetId: '123456789',
    temToken: true,
    testEventCode: '',
    valorPadrao: null,
    ultimoTeste: null,
    atualizadoEm: null,
    atualizadoPor: null,
};

const EVENTOS = [
    {
        id: 'e1',
        conversationId: 'c1',
        contato: 'Ana Souza',
        evento: 'Purchase',
        canal: 'whatsapp',
        colunaNome: 'Vendido',
        valor: 89900,
        status: 'enviado',
        motivo: null,
        ultimoErro: null,
        tentativas: 1,
        quando: '2026-11-06T15:00:00.000Z',
        enviadoEm: '2026-11-06T15:00:02.000Z',
    },
    {
        id: 'e2',
        conversationId: 'c2',
        contato: 'Bruno',
        evento: 'Purchase',
        canal: null,
        colunaNome: 'Vendido',
        valor: null,
        status: 'ignorado',
        motivo: 'não veio de anúncio',
        ultimoErro: null,
        tentativas: 0,
        quando: '2026-11-06T14:00:00.000Z',
        enviadoEm: null,
    },
];

function api(extra: Record<string, unknown> = {}) {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/wa/conversoes-meta/testar') {
            return { ok: true, json: async () => ({ ok: true, mensagem: 'Conectado ao conjunto de dados "Loja".', ...extra }) };
        }
        if (init?.method === 'PUT') return { ok: true, json: async () => ({ ok: true, config: CONFIG }) };
        return { ok: true, json: async () => ({ config: CONFIG, eventos: EVENTOS }) };
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

describe('EventosParaMeta', () => {
    it('mostra a situação e os eventos, com o motivo de quem não foi', async () => {
        api();
        render(<EventosParaMeta />);
        expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
        expect(screen.getByText('Ligado')).toBeInTheDocument();
        expect(screen.getByText('salvo')).toBeInTheDocument();
        expect(screen.getByText('Enviado')).toBeInTheDocument();
        expect(screen.getByText('não veio de anúncio')).toBeInTheDocument();
        expect(screen.getByText('Bruno').closest('a')?.getAttribute('href')).toBe('/dashboard/admin/whatsapp/central?c=c2');
    });

    it('o modal testa com o que está no formulário e salva sem mandar token em branco', async () => {
        const fetch = api();
        render(<EventosParaMeta />);
        fireEvent.click(await screen.findByText('Configurar'));
        expect(screen.getByPlaceholderText('Salvo. Deixe em branco para manter')).toHaveValue('');

        fireEvent.change(screen.getByPlaceholderText('Ex.: TEST12345'), { target: { value: 'TEST123' } });
        fireEvent.click(screen.getByText('Testar conexão'));
        expect(await screen.findByText('Conectado ao conjunto de dados "Loja".')).toBeInTheDocument();
        const teste = fetch.mock.calls.find(([u]) => u === '/api/wa/conversoes-meta/testar')!;
        expect(JSON.parse(String(teste[1]!.body))).toEqual({ datasetId: '123456789', testEventCode: 'TEST123' });

        fireEvent.click(screen.getByText('Salvar'));
        await waitFor(() => expect(fetch.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(true));
        const put = fetch.mock.calls.find(([, i]) => i?.method === 'PUT')!;
        expect(JSON.parse(String(put[1]!.body))).toEqual({
            ativo: true,
            datasetId: '123456789',
            testEventCode: 'TEST123',
            valorPadrao: null,
        });
    });
});
