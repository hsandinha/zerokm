import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes de Segurança e Autorização — API de Margem
 * 
 * Foco em hierarquia de permissões:
 * - Principal (dono) pode ler e alterar margem
 * - Convidado (funcionário) pode ler, mas NÃO pode alterar
 * - Usuário sem sessão recebe 401
 */

const mockGetServerSession = vi.fn();
const mockUserFindOne = vi.fn();
const mockInviteFindOne = vi.fn();
const mockUserFindById = vi.fn();
const mockUserSave = vi.fn();

vi.mock('next-auth', () => ({
    getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/models/User', () => ({
    default: {
        findOne: (...args: any[]) => ({
            lean: () => mockUserFindOne(...args),
        }),
        findById: (...args: any[]) => ({
            lean: () => mockUserFindById(...args),
        }),
    },
}));

vi.mock('@/models/Invite', () => ({
    default: {
        findOne: (...args: any[]) => ({
            lean: () => mockInviteFindOne(...args),
        }),
    },
}));

const importRoute = async () => {
    const mod = await import('@/app/api/dashboard/client/margin/route');
    return mod;
};

describe('API /api/dashboard/client/margin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ═══════════════════════════════════════
    // TESTES DE AUTENTICAÇÃO (401)
    // ═══════════════════════════════════════
    describe('Autenticação', () => {
        it('GET should return 401 when not authenticated', async () => {
            mockGetServerSession.mockResolvedValue(null);
            const { GET } = await importRoute();
            const req = new Request('http://localhost/api/dashboard/client/margin');
            const res = await GET(req as any);
            expect(res.status).toBe(401);
        });

        it('PATCH should return 401 when not authenticated', async () => {
            mockGetServerSession.mockResolvedValue(null);
            const { PATCH } = await importRoute();
            const req = new Request('http://localhost/api/dashboard/client/margin', {
                method: 'PATCH',
                body: JSON.stringify({ margem: 5, marginMode: 'percent', fixedMargin: 0 }),
            });
            const res = await PATCH(req as any);
            expect(res.status).toBe(401);
        });
    });

    // ═══════════════════════════════════════
    // GET — PRINCIPAL vs CONVIDADO
    // ═══════════════════════════════════════
    describe('GET — Hierarquia Principal/Convidado', () => {
        it('should return the principal own marginConfig', async () => {
            mockGetServerSession.mockResolvedValue({ user: { email: 'dono@loja.com' } });
            mockUserFindOne.mockResolvedValue({
                _id: 'u1',
                email: 'dono@loja.com',
                isInvitee: false,
                marginConfig: { mode: 'percent', percentValue: 12, fixedValue: 500 },
            });

            const { GET } = await importRoute();
            const res = await GET(new Request('http://localhost/api/dashboard/client/margin') as any);
            const data = await res.json();

            expect(data.margem).toBe(12);
            expect(data.fixedMargin).toBe(500);
            expect(data.marginMode).toBe('percent');
            expect(data.isInvitee).toBe(false);
        });

        it('should return the INVITER marginConfig when user is a guest (convidado)', async () => {
            mockGetServerSession.mockResolvedValue({ user: { email: 'func@loja.com' } });
            mockUserFindOne.mockResolvedValue({
                _id: 'u2',
                email: 'func@loja.com',
                isInvitee: true,
                marginConfig: { mode: 'percent', percentValue: 0, fixedValue: 0 },
            });
            mockInviteFindOne.mockResolvedValue({
                inviteeUserId: 'u2',
                inviterId: 'u1',
                status: 'accepted',
            });
            mockUserFindById.mockResolvedValue({
                _id: 'u1',
                marginConfig: { mode: 'percent', percentValue: 15, fixedValue: 1000 },
            });

            const { GET } = await importRoute();
            const res = await GET(new Request('http://localhost/api/dashboard/client/margin') as any);
            const data = await res.json();

            expect(data.margem).toBe(15);
            expect(data.fixedMargin).toBe(1000);
            expect(data.isInvitee).toBe(true);
        });
    });

    // ═══════════════════════════════════════
    // PATCH — AUTORIZAÇÃO (403 para convidado)
    // ═══════════════════════════════════════
    describe('PATCH — Autorização', () => {
        it('should return 403 when a guest (convidado) tries to update margin', async () => {
            mockGetServerSession.mockResolvedValue({ user: { email: 'func@loja.com' } });
            
            // PATCH uses findOne without .lean()
            vi.mocked(await import('@/models/User')).default.findOne = vi.fn().mockResolvedValue({
                _id: 'u2',
                email: 'func@loja.com',
                isInvitee: true,
                save: mockUserSave,
            }) as any;

            const { PATCH } = await importRoute();
            const req = new Request('http://localhost/api/dashboard/client/margin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ margem: 10, marginMode: 'percent', fixedMargin: 0 }),
            });
            const res = await PATCH(req as any);

            expect(res.status).toBe(403);
            expect(mockUserSave).not.toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════
    // PATCH — VALIDAÇÃO DE INPUTS
    // ═══════════════════════════════════════
    describe('PATCH — Validação de Inputs (Segurança)', () => {
        const setupPrincipal = async () => {
            mockGetServerSession.mockResolvedValue({ user: { email: 'dono@loja.com' } });
            vi.mocked(await import('@/models/User')).default.findOne = vi.fn().mockResolvedValue({
                _id: 'u1',
                email: 'dono@loja.com',
                isInvitee: false,
                marginConfig: {},
                save: mockUserSave,
            }) as any;
        };

        it('should return 400 for negative margin percentage', async () => {
            await setupPrincipal();
            const { PATCH } = await importRoute();
            const req = new Request('http://localhost/api/dashboard/client/margin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ margem: -5, marginMode: 'percent', fixedMargin: 0 }),
            });
            const res = await PATCH(req as any);
            expect(res.status).toBe(400);
        });

        it('should return 400 for invalid marginMode', async () => {
            await setupPrincipal();
            const { PATCH } = await importRoute();
            const req = new Request('http://localhost/api/dashboard/client/margin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ margem: 10, marginMode: 'HACKED', fixedMargin: 0 }),
            });
            const res = await PATCH(req as any);
            expect(res.status).toBe(400);
        });

        it('should return 400 for non-numeric margin value (injection attempt)', async () => {
            await setupPrincipal();
            const { PATCH } = await importRoute();
            const req = new Request('http://localhost/api/dashboard/client/margin', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ margem: 'DROP TABLE users', marginMode: 'percent', fixedMargin: 0 }),
            });
            const res = await PATCH(req as any);
            expect(res.status).toBe(400);
        });
    });
});
