import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KanbanBoard from '@/components/crm/KanbanBoard';

const stages = [
    { id: 's1', name: 'Novos Leads', order: 0, color: '#3B82F6', type: 'open' },
    { id: 's2', name: 'Proposta Enviada', order: 1, color: '#FBBF24', type: 'proposal' },
    { id: 's3', name: 'Venda Ganha', order: 2, color: '#10B981', type: 'won' },
    { id: 's4', name: 'Venda Perdida', order: 3, color: '#EF4444', type: 'lost' },
];

const leads = [
    {
        id: 'l1', name: 'Hebert Sandinha', phone: '31984005308', email: 'h@cnv.com',
        tags: ['Meta - Público Aberto'], stageId: 's1', ownerId: null, ownerName: 'Ana',
        lostReason: null, notes: null, source: null, createdAt: '2026-07-01T12:00:00.000Z',
    },
];

const report = {
    period: { preset: 'all', from: null, to: null },
    radar: { leadsCriados: 10, propostasEnviadas: 4, vendasGanhas: 2, vendasPerdidas: 3 },
    conversao: { leadParaProposta: 40, propostaParaVenda: 50, geral: 20 },
    porEtapa: [
        { id: 's1', name: 'Novos Leads', color: '#3B82F6', type: 'open', order: 0, entradas: 10, atuais: 1, conversao: 100 },
        { id: 's2', name: 'Proposta Enviada', color: '#FBBF24', type: 'proposal', order: 1, entradas: 4, atuais: 0, conversao: 40 },
    ],
    porOrigem: [{ tag: 'Meta - Público Aberto', criados: 6, propostas: 3, ganhas: 2, conversao: 33.3 }],
    motivosPerda: [{ reason: 'preco', label: 'Preço', total: 3, percentual: 100 }],
};

const leadDetail = {
    ...leads[0],
    stageName: 'Novos Leads',
    stageType: 'open',
    firstMessage: 'Olá! Vim do anúncio e gostaria de criar minha conta no CNV',
    history: [
        { id: 'e1', type: 'created', fromStageName: null, toStageName: 'Novos Leads', actor: 'webhook', actorEmail: null, lostReason: null, createdAt: '2026-07-01T12:00:00.000Z' },
        { id: 'e2', type: 'stage_changed', fromStageName: 'Novos Leads', toStageName: 'Proposta Enviada', actor: 'user', actorEmail: 'ana@cnv.com', lostReason: null, createdAt: '2026-07-02T12:00:00.000Z' },
    ],
};

const tasks = [
    { id: 't1', title: 'Ligar para negociar entrada', dueAt: '2026-07-20T14:00:00.000Z', done: false, doneAt: null, createdBy: 'ana@cnv.com', createdAt: '2026-07-01T12:00:00.000Z' },
];

const descartados = [
    {
        id: 'l9', name: 'Lead Descartado', phone: '11999998888', email: null,
        tags: ['Indicação'], stageId: 's1', ownerId: null, ownerName: 'Bruna',
        lostReason: null, notes: null, source: 'Indicação', createdAt: '2026-06-01T12:00:00.000Z',
    },
];

const json = (data: any) => Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);

let chamadas: { url: string; method: string; body: any }[];

beforeEach(() => {
    chamadas = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
        chamadas.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : null });
        if (url.startsWith('/api/crm/stages')) return json({ data: stages });
        if (url.startsWith('/api/crm/leads/l1/tasks')) return json({ data: tasks });
        if (url.startsWith('/api/crm/leads/l1')) return json({ data: leadDetail });
        if (url.includes('trash=true')) return json({ data: descartados });
        if (url.startsWith('/api/crm/leads')) return json({ data: leads });
        if (url.startsWith('/api/crm/reports')) return json({ data: report });
        if (url.startsWith('/api/crm/tags')) return json({ data: ['Meta - Público Aberto'] });
        if (url.startsWith('/api/crm/owners')) return json({ data: [{ id: 'u1', name: 'Ana', email: 'ana@cnv.com' }] });
        return json({ data: [] });
    }));
});

describe('KanbanBoard', () => {
    it('mostra o radar comercial e as colunas do funil', async () => {
        render(<KanbanBoard />);

        expect(await screen.findByText('Pipeline de leads')).toBeInTheDocument();

        expect(screen.getByText('Leads criados')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getByText('40% dos leads criados')).toBeInTheDocument();
        expect(screen.getByText('20%')).toBeInTheDocument();

        expect(screen.getByText('Venda Perdida')).toBeInTheDocument();
        // O card exibe o nome em caixa alta só via CSS; no DOM ele continua como veio da API.
        expect(screen.getByText('Hebert Sandinha')).toBeInTheDocument();
        // A tag aparece duas vezes: no card do lead e como opção do filtro de origem.
        expect(screen.getAllByText('Meta - Público Aberto').length).toBeGreaterThanOrEqual(2);
        // Mesma coisa com o responsável, que agora também é opção do filtro de vendedor.
        expect(screen.getAllByText('Ana').length).toBeGreaterThanOrEqual(1);
    });

    it('alterna para os relatórios', async () => {
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByRole('button', { name: 'Relatórios' }));

        expect(await screen.findByText('Conversão por etapa')).toBeInTheDocument();
        expect(screen.getByText('Conversão por origem')).toBeInTheDocument();
        expect(screen.getByText('Motivos de perda')).toBeInTheDocument();
        expect(screen.getByText('Preço')).toBeInTheDocument();
        expect(screen.getByText('33.3%')).toBeInTheDocument();
    });

    it('abre o lead e mostra o histórico de movimentações', async () => {
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByTitle('Abrir lead'));

        expect(await screen.findByText('Histórico de movimentações')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByText(/Lead criado em/)).toBeInTheDocument();
        });
        // "Proposta Enviada" também é o título de uma coluna; o autor do evento é único do modal.
        expect(screen.getByText(/ana@cnv\.com/)).toBeInTheDocument();
        expect(screen.getByText(/Integração/)).toBeInTheDocument();
        expect(screen.getByText(/Vim do anúncio/)).toBeInTheDocument();
    });

    it('mostra valor da proposta e as tarefas de follow-up no modal do lead', async () => {
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByTitle('Abrir lead'));

        expect(await screen.findByLabelText('Valor da proposta (R$)')).toBeInTheDocument();
        expect(screen.getByText('Tarefas e follow-up')).toBeInTheDocument();
        expect(screen.getByText('Ligar para negociar entrada')).toBeInTheDocument();
    });

    it('pede período personalizado com dois campos de data', async () => {
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByRole('button', { name: 'Personalizado' }));

        expect(screen.getByLabelText('Data inicial')).toBeInTheDocument();
        expect(screen.getByLabelText('Data final')).toBeInTheDocument();
    });
    it('oferece as novas origens ao cadastrar um lead à mão', async () => {
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByRole('button', { name: /Novo Lead/ }));

        const origem = await screen.findByDisplayValue('Manual');
        const opcoes = Array.from(origem.querySelectorAll('option')).map(o => o.textContent);
        expect(opcoes).toEqual(['Manual', 'Vera I.A', 'Indicação', 'Prospecção interna']);
    });

    it('filtra os leads por vendedor', async () => {
        render(<KanbanBoard />);
        const filtro = await screen.findByLabelText('Filtrar por responsável');

        fireEvent.change(filtro, { target: { value: 'u1' } });
        await waitFor(() => {
            expect(chamadas.some(c => c.url.includes('/api/crm/leads?') && c.url.includes('ownerId=u1'))).toBe(true);
        });
    });

    it('permite filtrar quem está sem responsável', async () => {
        render(<KanbanBoard />);
        const filtro = await screen.findByLabelText('Filtrar por responsável');

        fireEvent.change(filtro, { target: { value: 'none' } });
        await waitFor(() => {
            expect(chamadas.some(c => c.url.includes('ownerId=none'))).toBe(true);
        });
    });

    it('lista os leads descartados na lixeira', async () => {
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByRole('button', { name: /Lixeira/ }));

        expect(await screen.findByText('Lead Descartado')).toBeInTheDocument();
        // O lead ativo não aparece na lixeira.
        expect(screen.queryByText('Hebert Sandinha')).not.toBeInTheDocument();
    });

    it('mostra no botão quantos leads estão na lixeira', async () => {
        render(<KanbanBoard />);
        expect(await screen.findByRole('button', { name: /Lixeira \(1\)/ })).toBeInTheDocument();
    });

    it('restaura um lead da lixeira', async () => {
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByRole('button', { name: /Lixeira/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Restaurar' }));

        await waitFor(() => {
            const patch = chamadas.find(c => c.method === 'PATCH' && c.url.includes('/api/crm/leads/l9'));
            expect(patch?.body).toEqual({ ativo: true });
        });
    });

    it('exclui definitivamente após confirmação', async () => {
        vi.stubGlobal('confirm', vi.fn(() => true));
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByRole('button', { name: /Lixeira/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Excluir definitivamente' }));

        await waitFor(() => {
            expect(chamadas.some(c => c.method === 'DELETE' && c.url.includes('/api/crm/leads/l9'))).toBe(true);
        });
    });

    it('não exclui quando a confirmação é recusada', async () => {
        vi.stubGlobal('confirm', vi.fn(() => false));
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByRole('button', { name: /Lixeira/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Excluir definitivamente' }));

        expect(chamadas.some(c => c.method === 'DELETE')).toBe(false);
    });

    it('manda o lead para a lixeira pelo modal de detalhe', async () => {
        vi.stubGlobal('confirm', vi.fn(() => true));
        render(<KanbanBoard />);
        fireEvent.click(await screen.findByTitle('Abrir lead'));
        fireEvent.click(await screen.findByRole('button', { name: /Mover para lixeira/ }));

        await waitFor(() => {
            const patch = chamadas.find(c => c.method === 'PATCH' && c.url.includes('/api/crm/leads/l1'));
            expect(patch?.body).toEqual({ ativo: false });
        });
    });
});
