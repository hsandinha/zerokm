import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
// As server actions puxam Mongo e Firebase no import — fora do Next isso
// explode. O grid não as exercita; a aba Acessos tem os handlers mockados.
vi.mock('@/app/dashboard/admin/users/actions', () => ({
    getUserAccessStatus: vi.fn(async () => ({ success: true, disabled: false, allowedProfiles: ['cliente'] })),
    updateUserProfiles: vi.fn(async () => ({ success: true })),
    toggleUserStatus: vi.fn(async () => ({ success: true })),
    deleteUser: vi.fn(async () => ({ success: true })),
}));

import { CRMManagement } from '@/components/admin/CRMManagement';

const cliente = (over: Record<string, unknown>) => ({
    id: 'x', displayName: 'Cliente', email: 'c@x.com', phoneNumber: '31999999999', cpf: '',
    address: null, profileType: 'cliente', credits: 0, status: 'no_plan',
    planName: null, planType: null, expiresAt: null, daysUntilExpiry: null,
    activationMethod: null, paymentMethod: null, billingType: null,
    createdAt: '2026-01-01T12:00:00.000Z', hasCard: false, profileCompletion: 0,
    inviteCount: 0, isInvitee: false, vendedorId: null, vendedorNome: null,
    ...over,
});

const CLIENTES = [
    cliente({ id: '1', displayName: 'Bravo Veículos', createdAt: '2026-05-10T12:00:00.000Z', vendedorId: 'v2', status: 'active', planName: 'Ilimitado', daysUntilExpiry: 30, activationMethod: 'pix' }),
    cliente({ id: '2', displayName: 'Alfa Motors', createdAt: '2026-08-09T12:00:00.000Z', vendedorId: 'v1', status: 'active', planName: 'Ilimitado', daysUntilExpiry: 5, activationMethod: 'cortesia' }),
    cliente({ id: '3', displayName: 'Charlie Auto', createdAt: '2026-02-20T12:00:00.000Z', vendedorId: null, status: 'no_plan' }),
];

const VENDEDORES = [
    { id: 'v1', displayName: 'Zeca', email: 'z@x.com' },
    { id: 'v2', displayName: 'Ana', email: 'a@x.com' },
];

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (String(url).includes('/api/admin/vendedores')) {
            return { ok: true, json: async () => VENDEDORES } as Response;
        }
        if (String(url).includes('/api/admin/crm')) {
            return { ok: true, json: async () => ({ clients: CLIENTES }) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
    }));
});

afterEach(() => vi.unstubAllGlobals());

/** Nomes das linhas, na ordem em que aparecem no grid. */
const ordemNaTela = () =>
    Array.from(document.querySelectorAll('article'))
        .map(a => within(a as HTMLElement).getByText(/Veículos|Motors|Auto/).textContent);

const cabecalho = (nome: RegExp) => screen.getByRole('button', { name: nome });

const montar = async () => {
    render(<CRMManagement />);
    await screen.findByText('Alfa Motors');
};

describe('CRM — grid de clientes', () => {
    it('mostra a data de cadastro de cada cliente', async () => {
        await montar();
        expect(screen.getByText('09/08/2026')).toBeInTheDocument();
        expect(screen.getByText('10/05/2026')).toBeInTheDocument();
        expect(screen.getByText('20/02/2026')).toBeInTheDocument();
    });

    it('abre a lista com os cadastros mais recentes no topo', async () => {
        await montar();
        expect(ordemNaTela()).toEqual(['Alfa Motors', 'Bravo Veículos', 'Charlie Auto']);
    });

    it('inverte para os mais antigos ao clicar em Cadastro', async () => {
        await montar();
        fireEvent.click(cabecalho(/^Cadastro/));
        await waitFor(() => expect(ordemNaTela()[0]).toBe('Charlie Auto'));
        expect(ordemNaTela()).toEqual(['Charlie Auto', 'Bravo Veículos', 'Alfa Motors']);
    });

    it('volta para os mais recentes no clique seguinte', async () => {
        await montar();
        fireEvent.click(cabecalho(/^Cadastro/));
        fireEvent.click(cabecalho(/^Cadastro/));
        await waitFor(() => expect(ordemNaTela()[0]).toBe('Alfa Motors'));
    });

    it('volta a priorizar os recentes ao retornar de outra coluna', async () => {
        await montar();
        fireEvent.click(cabecalho(/^Cliente/));
        fireEvent.click(cabecalho(/^Cadastro/));
        await waitFor(() => expect(ordemNaTela()[0]).toBe('Alfa Motors'));
    });

    it('ordena por cliente em A→Z', async () => {
        await montar();
        fireEvent.click(cabecalho(/^Cliente/));
        await waitFor(() => expect(ordemNaTela()[0]).toBe('Alfa Motors'));
        expect(ordemNaTela()).toEqual(['Alfa Motors', 'Bravo Veículos', 'Charlie Auto']);
    });

    it('ordena por assinatura pelos dias restantes', async () => {
        await montar();
        fireEvent.click(cabecalho(/^Assinatura/));
        await waitFor(() => expect(ordemNaTela()[0]).toBe('Alfa Motors'));
        // Charlie não tem plano: vai para o fim mesmo sendo o "menor" valor.
        expect(ordemNaTela()).toEqual(['Alfa Motors', 'Bravo Veículos', 'Charlie Auto']);
    });

    it('ordena por financeiro e joga quem não tem pagamento para o fim', async () => {
        await montar();
        fireEvent.click(cabecalho(/^Financeiro/));
        await waitFor(() => expect(ordemNaTela()[2]).toBe('Charlie Auto'));
        // 🎁 Cortesia antes de PIX; sem pagamento por último.
        expect(ordemNaTela()).toEqual(['Alfa Motors', 'Bravo Veículos', 'Charlie Auto']);
    });

    it('ordena por responsável e joga quem não tem vendedor para o fim', async () => {
        await montar();
        fireEvent.click(cabecalho(/^Responsável/));
        await waitFor(() => expect(ordemNaTela()[0]).toBe('Bravo Veículos'));
        // Ana, Zeca, e o sem vendedor por último.
        expect(ordemNaTela()).toEqual(['Bravo Veículos', 'Alfa Motors', 'Charlie Auto']);
    });

    it('mantém o sem-vendedor no fim ao inverter a direção', async () => {
        await montar();
        fireEvent.click(cabecalho(/^Responsável/));
        fireEvent.click(cabecalho(/^Responsável/));
        await waitFor(() => expect(ordemNaTela()[0]).toBe('Alfa Motors'));
        expect(ordemNaTela()[2]).toBe('Charlie Auto');
    });
});
