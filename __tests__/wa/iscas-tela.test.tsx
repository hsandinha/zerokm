// Tela das iscas de comentário: renderiza o que a API devolve (fetch falso),
// abre o modal da Nova isca com o contador da mensagem privada, cai no campo
// do id do post quando o gateway não lista os posts, manda o corpo certo e
// mostra os últimos comentários com o link para a conversa na Central.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Iscas } from '@wa/components/iscas';
import { WaPanelProvider, STORE_PANEL } from '@wa/components/wa-panel';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const PAINEL = {
    podeEditar: true,
    canais: [{ id: 'canal-1', kind: 'instagram', label: '@loja.oficial', status: 'connected' }],
    iscas: [
        {
            id: 'isca-1',
            channelId: 'canal-1',
            canal: 'instagram',
            mediaId: 'm1',
            postLegenda: 'Onix 2025 completo',
            postImagem: null,
            postLink: null,
            keyword: 'EU QUERO',
            publicReply: 'Te chamei no Direct!',
            directMessage: 'Oi! Te mando as fotos.',
            ativo: true,
            priority: 0,
            comentarios: 12,
            directs: 11,
            falhas: 1,
            createdAt: '2026-11-01T10:00:00Z',
        },
    ],
    comentarios: [
        {
            id: 'c1',
            channelId: 'canal-1',
            canal: 'instagram',
            mediaId: 'm1',
            texto: 'eu quero!',
            autor: '@ana',
            iscaId: 'isca-1',
            respondeuPublico: true,
            respondeuDirect: true,
            erro: null,
            conversationId: 'conv-9',
            em: '2026-11-05T12:00:00Z',
        },
    ],
};

function gateway() {
    const chamadas: Array<{ url: string; init?: RequestInit }> = [];
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
        chamadas.push({ url, init });
        if (url.startsWith('/api/wa/iscas/posts')) return { ok: true, json: async () => ({ posts: null }) };
        if (init?.method === 'POST') return { ok: true, json: async () => ({ ok: true, avisos: [] }) };
        return { ok: true, json: async () => PAINEL };
    });
    vi.stubGlobal('fetch', fn);
    return chamadas;
}

describe('Iscas', () => {
    it('lista as iscas com os números e cria uma nova pelo modal', async () => {
        const chamadas = gateway();
        render(
            <WaPanelProvider value={STORE_PANEL}>
                <Iscas />
            </WaPanelProvider>,
        );
        expect(await screen.findByText('EU QUERO')).toBeInTheDocument();
        expect(screen.getByText(/No post "Onix 2025 completo"/)).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText(/uma mensagem privada por comentário, em até 7 dias/)).toBeInTheDocument();

        fireEvent.click(screen.getAllByText('Nova isca')[0]);
        // Contador da mensagem privada e o da resposta pública.
        expect(await screen.findAllByText('0/1000')).toHaveLength(2);
        // Sem a lista do gateway, volta o campo do id do post.
        expect(await screen.findByPlaceholderText('Id do post (em branco: todos os posts)')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Palavra-chave'), { target: { value: 'quero' } });
        fireEvent.change(screen.getByLabelText('Mensagem no Direct'), { target: { value: 'Oi! Quer as fotos?' } });
        expect(screen.getByText('18/1000')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Criar isca'));

        await waitFor(() => expect(chamadas.some((c) => c.init?.method === 'POST')).toBe(true));
        const post = chamadas.find((c) => c.init?.method === 'POST')!;
        expect(post.url).toBe('/api/wa/iscas');
        expect(JSON.parse(String(post.init!.body))).toEqual({
            channelId: 'canal-1',
            mediaId: null,
            post: null,
            keyword: 'quero',
            publicReply: '',
            directMessage: 'Oi! Quer as fotos?',
            ativo: true,
        });
    });

    it('mostra os últimos comentários com o link para a conversa', async () => {
        gateway();
        render(
            <WaPanelProvider value={STORE_PANEL}>
                <Iscas />
            </WaPanelProvider>,
        );
        fireEvent.click(await screen.findByText('Últimos comentários'));
        expect(screen.getByText('@ana')).toBeInTheDocument();
        expect(screen.getByText('Mensagem no Direct')).toBeInTheDocument();
        expect(screen.getByText('Respondeu no comentário')).toBeInTheDocument();
        expect(screen.getByText(/Abrir conversa/).closest('a')).toHaveAttribute('href', '/dashboard/atendimento/central?c=conv-9');
    });

    it('sem Instagram nem Página conectados, explica o que conectar', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: true, json: async () => ({ podeEditar: true, canais: [], iscas: [], comentarios: [] }) })),
        );
        render(
            <WaPanelProvider value={STORE_PANEL}>
                <Iscas />
            </WaPanelProvider>,
        );
        expect(await screen.findByText('Conecte o Instagram ou a Página do Facebook')).toBeInTheDocument();
        expect(screen.queryByText('Nova isca')).not.toBeInTheDocument();
        expect(screen.getByText('Abrir Configuração').closest('a')).toHaveAttribute('href', '/dashboard/atendimento/configuracao');
    });
});
