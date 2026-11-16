import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// As server actions puxam Mongo e Firebase no import: fora do Next isso explode.
const acesso = { disabled: false };
const toggleUserStatus = vi.fn(async (_uid: string, _desativar: boolean) => ({ success: true }));
vi.mock('@/app/dashboard/admin/users/actions', () => ({
    getUserAccessStatus: vi.fn(async () => ({ success: true, disabled: acesso.disabled, allowedProfiles: ['cliente'] })),
    updateUserProfiles: vi.fn(async () => ({ success: true })),
    toggleUserStatus: (uid: string, desativar: boolean) => toggleUserStatus(uid, desativar),
    deleteUser: vi.fn(async () => ({ success: true })),
}));

import { FichaClienteModal } from '@/components/admin/FichaCliente';

const cliente = (over: Record<string, unknown> = {}) => ({
    id: 'c1', displayName: 'Bravo Veículos', email: 'bravo@x.com', phoneNumber: '31999990000', cpf: '12345678000190', instagram: '',
    address: { street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Belo Horizonte', state: 'MG', zipCode: '30000-000' },
    profileType: 'cliente', credits: 0, status: 'active', planId: 'p1', planName: 'Acesso Total', planType: 'monthly',
    valorPlano: 699, valorTabela: 699, valorCombinadoAtivo: false,
    expiresAt: '2027-01-10T12:00:00.000Z', daysUntilExpiry: 55, activationMethod: 'pix', paymentMethod: 'pix', billingType: 'monthly',
    createdAt: '2026-05-10T12:00:00.000Z', firebaseUid: 'fb-1', hasCard: false, profileCompletion: 100,
    inviteCount: 1, telasExtras: [], isInvitee: false, vendedorId: 'v1',
    ...over,
});

const PLANOS = [
    { id: 'p1', name: 'Acesso Total', type: 'monthly', credits: null, price: 699, annualPrice: 6990, active: true },
    { id: 'a1', name: 'Atendimento Pro', type: 'monthly', credits: null, price: 199, active: true, publico: 'atendimento' },
];

type Chamada = { url: string; method: string; body: any };
let chamadas: Chamada[] = [];
let gravado = cliente();
let loja: unknown = null;

beforeEach(() => {
    chamadas = [];
    gravado = cliente();
    loja = null;
    acesso.disabled = false;
    toggleUserStatus.mockClear();
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        const method = init?.method || 'GET';
        const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
        chamadas.push({ url: u, method, body });
        const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) }) as Response;
        if (u.includes('/api/admin/crm/invites')) return ok([{ id: 'i1', nome: 'Carla Tela', email: 'carla@x.com', telefone: '', status: 'accepted', monthlyPrice: 99, createdAt: '2026-06-01T12:00:00.000Z' }]);
        if (u.includes('/api/admin/crm/acesso')) return ok({ ok: true, senhaProvisoria: 'k7m2p9xq' });
        if (u.includes('/api/admin/crm/edit')) return ok({ ok: true });
        if (u.includes('/api/admin/crm?id=')) return ok({ client: gravado });
        if (u.includes('/api/admin/crm') && method === 'PATCH') return ok({ ok: true });
        if (u.includes('/api/admin/plans')) return ok(PLANOS);
        if (u.includes('/api/admin/vendedores')) return ok([{ _id: 'v1', displayName: 'Zeca', email: 'z@x.com' }]);
        if (u.includes('/atendimento')) return ok({ loja });
        if (u.includes('/valor-combinado')) return ok({ plano: { id: 'p1', nome: 'Acesso Total', periodicidade: 'monthly', tabela: 699 }, valorCombinado: null, valorAtual: 699, telasExtras: 0, valorPorTela: 0, proximaCobranca: 699, boletosEmAberto: 0 });
        if (u.includes('/api/admin/cobrancas')) return ok({ data: [{ id: 'pg1', mpPaymentId: 'MANUAL-1', plano: 'Acesso Total', valor: 699, status: 'approved', criadoEm: '2026-10-10T12:00:00.000Z', boletoUrl: null, boletoBarcode: null, email: { enviadoEm: null, para: 'bravo@x.com', id: null, erro: null, situacao: null } }] });
        if (u.includes('/logo')) return ok({ logoUrl: null });
        return ok({});
    }));
});

afterEach(() => vi.unstubAllGlobals());

const abrir = async (props: Partial<React.ComponentProps<typeof FichaClienteModal>> = {}) => {
    const onMudou = vi.fn();
    const onClose = vi.fn();
    render(<FichaClienteModal userId="c1" onClose={onClose} onMudou={onMudou} {...props} />);
    await screen.findByRole('heading', { name: 'Bravo Veículos' });
    return { onMudou, onClose };
};
const aba = (nome: string) => fireEvent.click(screen.getByRole('tab', { name: nome }));

describe('Ficha do cliente', () => {
    it('carrega só o cliente pedido e mostra as cinco abas', async () => {
        await abrir();
        expect(chamadas.some(c => c.url === '/api/admin/crm?id=c1')).toBe(true);
        expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Dados', 'Acessos', 'Planos e assinaturas', 'Cobranças', 'Atividade']);
        expect(screen.getByRole('tab', { name: 'Dados' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('bravo@x.com · 31999990000')).toBeInTheDocument();
    });

    it('avisa quando o cliente não existe', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Cliente não encontrado.' }) }) as Response));
        render(<FichaClienteModal userId="nao-existe" onClose={() => {}} />);
        expect(await screen.findByText('Cliente não encontrado.')).toBeInTheDocument();
    });

    it('em dia não mostra selo de pendência', async () => {
        await abrir();
        expect(screen.queryByRole('button', { name: /^Pendência/ })).not.toBeInTheDocument();
    });

    it('mostra os selos e leva para a aba que resolve', async () => {
        gravado = cliente({ status: 'expired', daysUntilExpiry: -3, cpf: '' });
        await abrir();
        expect(screen.getByRole('button', { name: 'Pendência: Cadastro incompleto' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Pendência: Plano vencido' }));
        expect(screen.getByRole('tab', { name: 'Planos e assinaturas' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('button', { name: 'Renovar plano' })).toBeInTheDocument();
    });

    it('login desativado vira pendência "Sem login" na ficha', async () => {
        acesso.disabled = true;
        await abrir();
        expect(await screen.findByRole('button', { name: 'Pendência: Sem login' })).toBeInTheDocument();
    });

    it('edita os dados pela rota do CRM e avisa quem abriu', async () => {
        const { onMudou } = await abrir();
        fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
        fireEvent.change(screen.getByDisplayValue('Bravo Veículos'), { target: { value: 'Bravo Multimarcas' } });
        fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
        await waitFor(() => expect(onMudou).toHaveBeenCalled());
        const edicao = chamadas.find(c => c.url.includes('/api/admin/crm/edit'))!;
        expect(edicao.method).toBe('PATCH');
        expect(edicao.body).toMatchObject({ userId: 'c1', displayName: 'Bravo Multimarcas', address: { city: 'Belo Horizonte' } });
    });

    it('Acessos traz o login do titular e os convidados', async () => {
        await abrir({ abaInicial: 'acessos' });
        expect(await screen.findByText('Login ativo')).toBeInTheDocument();
        expect(await screen.findByText('Carla Tela')).toBeInTheDocument();
        expect(chamadas.some(c => c.url.includes('/api/admin/crm/invites?email=bravo%40x.com'))).toBe(true);
        expect(screen.getByRole('button', { name: 'Excluir usuário definitivamente' })).toBeInTheDocument();
    });

    it('gera nova senha provisória depois de confirmar', async () => {
        await abrir({ abaInicial: 'acessos' });
        fireEvent.click(await screen.findByRole('button', { name: 'Gerar nova senha provisória' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Gerar senha' }));
        expect(await screen.findByText('k7m2p9xq')).toBeInTheDocument();
        expect(chamadas.find(c => c.url.includes('/api/admin/crm/acesso'))!.body).toEqual({ userId: 'c1' });
    });

    it('desativa o login pela mesma action da tela Equipe', async () => {
        await abrir({ abaInicial: 'acessos' });
        fireEvent.click(await screen.findByRole('button', { name: 'Desativar acesso' }));
        const dialogo = (await screen.findAllByRole('dialog')).at(-1)!;
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Desativar acesso' }));
        await waitFor(() => expect(toggleUserStatus).toHaveBeenCalledWith('fb-1', true));
        expect(await screen.findByText('Login desativado')).toBeInTheDocument();
    });

    it('Planos mostra o plano de zero km e troca de plano pela rota do CRM', async () => {
        const { onMudou } = await abrir({ abaInicial: 'planos' });
        expect(screen.getByText('Acesso Total (mensal)')).toBeInTheDocument();
        expect(await screen.findByText('Preço da tabela')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Trocar ou renovar plano' }));
        const dialogo = (await screen.findAllByRole('dialog')).at(-1)!;
        expect(within(dialogo).getByText('Atribuir plano')).toBeInTheDocument();
        // Plano de atendimento não entra na lista do plano de zero km.
        expect(within(dialogo).queryByText(/Atendimento Pro/)).not.toBeInTheDocument();
        fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
        await waitFor(() => expect(onMudou).toHaveBeenCalled());
        const patch = chamadas.find(c => c.url === '/api/admin/crm' && c.method === 'PATCH')!;
        expect(patch.body).toMatchObject({ userId: 'c1', planId: 'p1', activationMethod: 'manual', paymentMethod: 'pix' });
    });

    it('sem loja de atendimento, explica onde a assinatura vai aparecer', async () => {
        await abrir({ abaInicial: 'planos' });
        expect(await screen.findByText(/ainda não tem loja de atendimento/)).toBeInTheDocument();
    });

    it('com loja de atendimento, ativa a assinatura pela rota das lojas', async () => {
        loja = { id: 'loja1', name: 'Bravo', access: { active: true, trial: true, trialEndsAt: '2026-11-20T12:00:00.000Z', expiresAt: null, planName: null }, aiActive: false };
        await abrir({ abaInicial: 'planos' });
        expect(await screen.findByText('Em teste')).toBeInTheDocument();
        const seletor = await screen.findByLabelText(/^Ativar 30 dias/);
        await waitFor(() => expect(within(seletor).getByText('Atendimento Pro: cortesia')).toBeInTheDocument());
        fireEvent.change(seletor, { target: { value: 'a1|cortesia' } });
        fireEvent.click(screen.getByRole('button', { name: 'Ativar atendimento' }));
        await waitFor(() => expect(chamadas.some(c => c.url === '/api/wa/lojas/loja1' && c.method === 'PATCH')).toBe(true));
        expect(chamadas.find(c => c.url === '/api/wa/lojas/loja1')!.body).toEqual({ acao: 'ativar', planId: 'a1', metodo: 'cortesia', billingType: 'monthly' });
    });

    it('Cobranças lista os pagamentos deste cliente', async () => {
        await abrir({ abaInicial: 'cobrancas' });
        expect(await screen.findByText('Pago')).toBeInTheDocument();
        expect(chamadas.some(c => c.url.includes('/api/admin/cobrancas?tudo=true&limit=20&userId=c1'))).toBe(true);
    });

    it('Atividade monta a linha do tempo com cadastro, plano e cobranças', async () => {
        await abrir({ abaInicial: 'atividade' });
        expect(screen.getByText('Cadastro criado')).toBeInTheDocument();
        expect(screen.getByText('Plano vence')).toBeInTheDocument();
        expect(await screen.findByText('Pagamento confirmado')).toBeInTheDocument();
    });

    it('tela extra não oferece plano, valor combinado nem convidados', async () => {
        gravado = cliente({ isInvitee: true });
        await abrir({ abaInicial: 'planos' });
        expect(screen.getByText(/Esta conta é uma tela extra/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /plano$/ })).not.toBeInTheDocument();
        aba('Acessos');
        expect(screen.queryByText('Convidados (telas extras)')).not.toBeInTheDocument();
    });
});
