import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CRMManagement } from '@/components/admin/CRMManagement';

const mockFetch = vi.fn();

const client = {
    id: 'client-1',
    displayName: 'Marcelo Central Motors',
    email: 'marcelo@example.com',
    phoneNumber: '11999999999',
    cpf: '',
    address: null,
    profileType: 'cliente' as const,
    credits: 0,
    status: 'active' as const,
    planName: 'Plano Consultas Ilimitadas',
    planType: 'monthly',
    expiresAt: '2026-07-15T12:00:00.000Z',
    daysUntilExpiry: 22,
    activationMethod: 'manual' as const,
    paymentMethod: 'pix' as const,
    billingType: 'monthly' as const,
    createdAt: '2026-06-01T12:00:00.000Z',
    hasCard: false,
    profileCompletion: 86,
    inviteCount: 0,
    isInvitee: false,
    vendedorId: null,
    vendedorNome: null,
};

describe('CRMManagement client grid', () => {
    beforeEach(() => {
        mockFetch.mockImplementation((url: string) => {
            if (url === '/api/admin/crm') {
                return Promise.resolve({
                    json: async () => ({
                        clients: [client],
                        summary: { total: 1, active: 1, expired: 0, no_plan: 0, cortesia: 0 },
                    }),
                });
            }
            if (url === '/api/admin/plans') return Promise.resolve({ json: async () => [] });
            if (url === '/api/admin/vendedores') return Promise.resolve({ json: async () => [] });
            return Promise.reject(new Error(`Unexpected fetch: ${url}`));
        });
        vi.stubGlobal('fetch', mockFetch);
    });

    it('groups client information into a concise decision grid', async () => {
        render(<CRMManagement />);

        expect(await screen.findByText('Marcelo Central Motors')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^cliente$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /assinatura/i })).toBeInTheDocument();
        expect(screen.getByText('Plano Consultas Ilimitadas')).toBeInTheDocument();
        expect(screen.getByText('PIX')).toBeInTheDocument();
        expect(screen.getByText('86%')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /ver detalhes/i })).toBeInTheDocument();
        expect(screen.queryByText('Cadastro')).not.toBeInTheDocument();
    });
});
