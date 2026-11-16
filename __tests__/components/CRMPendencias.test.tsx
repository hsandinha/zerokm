import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// As server actions puxam Mongo e Firebase no import: fora do Next isso explode.
vi.mock('@/app/dashboard/admin/users/actions', () => ({
    getUserAccessStatus: vi.fn(async () => ({ success: true, disabled: false, allowedProfiles: ['cliente'] })),
    updateUserProfiles: vi.fn(async () => ({ success: true })),
    toggleUserStatus: vi.fn(async () => ({ success: true })),
    deleteUser: vi.fn(async () => ({ success: true })),
    createUser: vi.fn(async () => ({ success: true, uid: 'u' })),
    criarUsuarioDaLoja: vi.fn(async () => ({ success: true })),
}));
vi.mock('next-auth/react', () => ({ getSession: vi.fn(async () => ({ user: { profile: 'administrador' } })) }));

import { CRMManagement } from '@/components/admin/CRMManagement';

const cliente = (over: Record<string, unknown>) => ({
    id: 'x', displayName: 'Cliente', email: 'c@x.com', phoneNumber: '31999999999', cpf: '12345678000190',
    address: { street: '', number: '', neighborhood: '', city: 'Betim', state: 'MG', zipCode: '' },
    profileType: 'cliente', credits: 0, status: 'active', planName: 'Ilimitado', planType: 'monthly',
    expiresAt: '2027-01-01T12:00:00.000Z', daysUntilExpiry: 30, activationMethod: 'pix', paymentMethod: 'pix', billingType: 'monthly',
    createdAt: '2026-01-01T12:00:00.000Z', firebaseUid: 'fb', hasCard: false, profileCompletion: 100,
    inviteCount: 0, isInvitee: false, vendedorId: null,
    ...over,
});

const CLIENTES = [
    cliente({ id: '1', displayName: 'Alfa Motors', email: 'alfa@x.com' }),
    cliente({ id: '2', displayName: 'Bravo Veículos', email: 'bravo@x.com', status: 'expired', daysUntilExpiry: -4, cpf: '' }),
    cliente({ id: '3', displayName: 'Charlie Auto', email: 'charlie@x.com', profileType: 'gratis', status: 'no_plan', planName: null, planType: null, expiresAt: null, daysUntilExpiry: null, activationMethod: null, paymentMethod: null, freeTrialExpired: true }),
];

let urls: string[] = [];

beforeEach(() => {
    urls = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const u = String(url);
        urls.push(u);
        const ok = (data: unknown) => ({ ok: true, json: async () => data }) as Response;
        if (u.includes('/api/admin/vendedores')) return ok([]);
        if (u.includes('/api/admin/crm/invites')) return ok([]);
        if (u.includes('/api/admin/crm?id=')) return ok({ client: CLIENTES.find(c => u.endsWith(`id=${c.id}`)) });
        if (u.includes('/api/admin/crm')) return ok({ clients: CLIENTES, summary: { total: 3, active: 1, expired: 1, no_plan: 1, cortesia: 0 } });
        if (u.includes('/api/admin/plans')) return ok([]);
        return ok({});
    }));
});

afterEach(() => vi.unstubAllGlobals());

const linhas = () => Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[];
const nomes = () => linhas().map(l => within(l).getByText(/Motors|Veículos|Auto/).textContent);
const montar = async () => {
    render(<CRMManagement />);
    await screen.findByText('Alfa Motors');
};

describe('CRM: pendências na lista', () => {
    it('mostra os selos de cada cliente sem consulta por linha', async () => {
        await montar();
        const [alfa, bravo, charlie] = ['Alfa Motors', 'Bravo Veículos', 'Charlie Auto'].map(n => linhas().find(l => l.textContent?.includes(n))!);
        expect(within(alfa).queryByRole('button', { name: /^Pendência/ })).not.toBeInTheDocument();
        expect(within(bravo).getByRole('button', { name: 'Pendência: Plano vencido' })).toBeInTheDocument();
        expect(within(bravo).getByRole('button', { name: 'Pendência: Cadastro incompleto' })).toBeInTheDocument();
        expect(within(charlie).getByRole('button', { name: 'Pendência: Teste vencido' })).toBeInTheDocument();
        // Uma carga da lista e uma dos vendedores: nada por cliente.
        expect(urls.filter(u => u.includes('/api/admin/crm'))).toEqual(['/api/admin/crm']);
    });

    it('filtra "Com pendência" com a contagem', async () => {
        await montar();
        const filtro = screen.getByRole('tab', { name: /Com pendência/ });
        expect(filtro).toHaveTextContent('2');
        fireEvent.click(filtro);
        await waitFor(() => expect(nomes()).toHaveLength(2));
        expect(nomes()).not.toContain('Alfa Motors');
    });

    it('abrir um cliente abre a ficha', async () => {
        await montar();
        fireEvent.click(within(linhas().find(l => l.textContent?.includes('Alfa Motors'))!).getByRole('button', { name: 'Ver detalhes' }));
        const ficha = await screen.findByRole('dialog');
        expect(await within(ficha).findByRole('heading', { name: 'Alfa Motors' })).toBeInTheDocument();
        expect(within(ficha).getByRole('tab', { name: 'Planos e assinaturas' })).toBeInTheDocument();
        expect(urls).toContain('/api/admin/crm?id=1');
    });

    it('o selo abre a ficha na aba que resolve a pendência', async () => {
        await montar();
        fireEvent.click(screen.getByRole('button', { name: 'Pendência: Plano vencido' }));
        const ficha = await screen.findByRole('dialog');
        await within(ficha).findByRole('heading', { name: 'Bravo Veículos' });
        expect(within(ficha).getByRole('tab', { name: 'Planos e assinaturas' })).toHaveAttribute('aria-selected', 'true');
    });

    it('o cabeçalho abre o Novo cadastro já em Lojista', async () => {
        await montar();
        fireEvent.click(screen.getByRole('button', { name: 'Novo cadastro' }));
        expect(await screen.findByText('Novo lojista')).toBeInTheDocument();
    });
});
