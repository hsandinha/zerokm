import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const usuario = (over: Record<string, unknown>) => ({
    uid: 'u', email: 'u@x.com', displayName: 'Usuário', disabled: false, allowedProfiles: ['operador'],
    creationTime: '2026-01-01T12:00:00.000Z', lastSignInTime: '2026-11-10T12:00:00.000Z', ...over,
});

const USUARIOS = [
    usuario({ uid: '1', email: 'ana@cnv.com', displayName: 'Ana Gerente', allowedProfiles: ['gerente'] }),
    usuario({ uid: '2', email: 'loja@x.com', displayName: 'Login da Loja', allowedProfiles: ['concessionaria'], dealershipId: 'd1' }),
    usuario({ uid: '3', email: 'beto@cnv.com', displayName: 'Beto Operador', allowedProfiles: ['operador'], disabled: true }),
    usuario({ uid: '4', email: 'caio@cnv.com', displayName: 'Caio Vendedor', allowedProfiles: ['vendedor', 'cliente'] }),
];

// As server actions puxam Mongo e Firebase no import: fora do Next isso explode.
vi.mock('@/app/dashboard/admin/users/actions', () => ({
    listAllUsers: vi.fn(async () => USUARIOS),
    updateUserProfiles: vi.fn(async () => ({ success: true })),
    toggleUserStatus: vi.fn(async () => ({ success: true })),
    deleteUser: vi.fn(async () => ({ success: true })),
    createUser: vi.fn(async () => ({ success: true, uid: 'novo' })),
    criarUsuarioDaLoja: vi.fn(async () => ({ success: true })),
    getUserAccessStatus: vi.fn(async () => ({ success: true })),
}));
vi.mock('next-auth/react', () => ({ getSession: vi.fn(async () => ({ user: { profile: 'administrador' } })) }));

import { UsersTable } from '@/app/dashboard/admin/users/UsersTable';

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response));
});
afterEach(() => vi.unstubAllGlobals());

const montar = async (props: React.ComponentProps<typeof UsersTable> = {}) => {
    render(<UsersTable {...props} />);
    await screen.findByText('Ana Gerente');
};

describe('Equipe: só a equipe interna', () => {
    it('não lista o login de concessionária', async () => {
        await montar();
        expect(screen.getByText('Beto Operador')).toBeInTheDocument();
        // Quem é da equipe e também cliente continua aqui.
        expect(screen.getByText('Caio Vendedor')).toBeInTheDocument();
        expect(screen.queryByText('Login da Loja')).not.toBeInTheDocument();
    });

    it('não tem mais os filtros de Concessionárias e Clientes', async () => {
        await montar();
        const filtros = screen.getByRole('tablist', { name: 'Filtrar usuários' });
        expect(within(filtros).getAllByRole('tab').map(b => b.textContent?.replace(/\d+/g, '').trim())).toEqual(['Todos', 'Ativos', 'Inativos']);
    });

    it('avisa onde ficam os outros logins e leva até lá', async () => {
        const concessionarias = vi.fn();
        const crm = vi.fn();
        await montar({ destinos: { concessionarias, crm } });
        expect(screen.getByText('Logins de concessionária ficam na ficha de cada loja, em Concessionárias. Lojistas ficam em Clientes.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Ir para Concessionárias' }));
        fireEvent.click(screen.getByRole('button', { name: 'Ir para Clientes' }));
        expect(concessionarias).toHaveBeenCalled();
        expect(crm).toHaveBeenCalled();
    });

    it('sem destino (administrativo não tem CRM), o atalho não aparece', async () => {
        await montar({ destinos: { concessionarias: vi.fn() } });
        expect(screen.queryByRole('button', { name: 'Ir para Clientes' })).not.toBeInTheDocument();
    });

    it('o botão de criar abre o Novo cadastro em Equipe interna, sem o perfil concessionária', async () => {
        await montar();
        fireEvent.click(screen.getByRole('button', { name: 'Novo cadastro' }));
        expect(await screen.findByText('Novo usuário da equipe')).toBeInTheDocument();
        expect(screen.queryByLabelText('Concessionária')).not.toBeInTheDocument();
    });

    it('editar acessos só oferece perfis da equipe', async () => {
        await montar();
        fireEvent.click(within(screen.getByText('Ana Gerente').closest('tr')!).getByRole('button', { name: 'Editar acessos' }));
        const dialogo = await screen.findByRole('dialog');
        expect(within(dialogo).getByLabelText('Gerente')).toBeChecked();
        expect(within(dialogo).queryByLabelText('Concessionária')).not.toBeInTheDocument();
    });
});
