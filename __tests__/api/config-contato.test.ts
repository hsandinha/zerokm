import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes de Segurança e Autorização — API de Contatos (/api/config/contato)
 *
 * Estes testes validam a lógica de negócio isoladamente, mocando
 * dependências externas (MongoDB, next-auth) para testar comportamentos
 * unitários de autenticação, autorização e sanitização.
 */

// Mock de módulos do Next.js e Mongoose
const mockGetServerSession = vi.fn();
const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn();

vi.mock('next-auth', () => ({
    getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

vi.mock('@/lib/authOptions', () => ({
    authOptions: {},
}));

vi.mock('@/lib/mongodb', () => ({
    default: vi.fn().mockResolvedValue(undefined),
}));

const mockCollection = {
    findOne: mockFindOne,
    updateOne: mockUpdateOne,
};

vi.mock('mongoose', () => ({
    default: {
        connection: {
            useDb: () => ({
                collection: () => mockCollection,
            }),
        },
    },
}));

// Import the actual route handlers AFTER mocking
const importRoute = async () => {
    const mod = await import('@/app/api/config/contato/route');
    return mod;
};

describe('API /api/config/contato', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET — Leitura Pública', () => {
        it('should return default values when no config exists in DB', async () => {
            mockFindOne.mockResolvedValue(null);

            const { GET } = await importRoute();
            const request = new Request('http://localhost:3000/api/config/contato');
            const response = await GET(request as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.whatsapp).toBe('11926384826');
            expect(data.email_general).toBe('cnv0kmsp@gmail.com');
        });

        it('should return stored values when config exists in DB', async () => {
            mockFindOne.mockResolvedValue({
                key: 'contato',
                whatsapp: '5521999999999',
                email_support: 'test@test.com',
                email_sales: 'sale@test.com',
                email_general: 'gen@test.com',
                address: 'Rio de Janeiro, RJ',
                business_hours: 'Seg-Sex: 08-17',
                cnpj: '99.999.999/0001-99',
            });

            const { GET } = await importRoute();
            const request = new Request('http://localhost:3000/api/config/contato');
            const response = await GET(request as any);
            const data = await response.json();

            expect(data.whatsapp).toBe('5521999999999');
            expect(data.address).toBe('Rio de Janeiro, RJ');
        });
    });

    describe('PATCH — Segurança: Autenticação', () => {
        it('should return 401 when user is not authenticated', async () => {
            mockGetServerSession.mockResolvedValue(null);

            const { PATCH } = await importRoute();
            const request = new Request('http://localhost:3000/api/config/contato', {
                method: 'PATCH',
                body: JSON.stringify({ whatsapp: '123' }),
            });
            const response = await PATCH(request as any);

            expect(response.status).toBe(401);
        });

        it('should return 401 when session has no email', async () => {
            mockGetServerSession.mockResolvedValue({ user: {} });

            const { PATCH } = await importRoute();
            const request = new Request('http://localhost:3000/api/config/contato', {
                method: 'PATCH',
                body: JSON.stringify({ whatsapp: '123' }),
            });
            const response = await PATCH(request as any);

            expect(response.status).toBe(401);
        });
    });

    describe('PATCH — Segurança: Autorização de Perfil', () => {
        it('should return 403 when user profile is "cliente"', async () => {
            mockGetServerSession.mockResolvedValue({
                user: { email: 'user@test.com', profile: 'cliente' },
            });

            const { PATCH } = await importRoute();
            const request = new Request('http://localhost:3000/api/config/contato', {
                method: 'PATCH',
                body: JSON.stringify({ whatsapp: '123' }),
            });
            const response = await PATCH(request as any);

            expect(response.status).toBe(403);
        });

        it('should return 403 when user profile is "operador"', async () => {
            mockGetServerSession.mockResolvedValue({
                user: { email: 'op@test.com', profile: 'operador' },
            });

            const { PATCH } = await importRoute();
            const request = new Request('http://localhost:3000/api/config/contato', {
                method: 'PATCH',
                body: JSON.stringify({ whatsapp: '123' }),
            });
            const response = await PATCH(request as any);

            expect(response.status).toBe(403);
        });

        it('should allow PATCH when user profile is "admin"', async () => {
            mockGetServerSession.mockResolvedValue({
                user: { email: 'admin@test.com', profile: 'admin' },
            });
            mockUpdateOne.mockResolvedValue({ acknowledged: true });

            const { PATCH } = await importRoute();
            const request = new Request('http://localhost:3000/api/config/contato', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ whatsapp: '5511926384826' }),
            });
            const response = await PATCH(request as any);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.ok).toBe(true);
        });

        it('should allow PATCH when user profile is "gerente"', async () => {
            mockGetServerSession.mockResolvedValue({
                user: { email: 'ger@test.com', profile: 'gerente' },
            });
            mockUpdateOne.mockResolvedValue({ acknowledged: true });

            const { PATCH } = await importRoute();
            const request = new Request('http://localhost:3000/api/config/contato', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ whatsapp: '5511926384826' }),
            });
            const response = await PATCH(request as any);

            expect(response.status).toBe(200);
        });
    });

    describe('PATCH — Persistência Correta', () => {
        it('should call updateOne with upsert:true and correct data', async () => {
            mockGetServerSession.mockResolvedValue({
                user: { email: 'admin@test.com', profile: 'admin' },
            });
            mockUpdateOne.mockResolvedValue({ acknowledged: true });

            const { PATCH } = await importRoute();
            const payload = {
                whatsapp: '5511999999999',
                email_support: 'sup@test.com',
                email_sales: 'ven@test.com',
                email_general: 'gen@test.com',
                address: 'BH, MG',
                business_hours: 'Seg-Sex: 10-19',
                cnpj: '11.111.111/0001-11',
            };

            const request = new Request('http://localhost:3000/api/config/contato', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            await PATCH(request as any);

            expect(mockUpdateOne).toHaveBeenCalledWith(
                { key: 'contato' },
                expect.objectContaining({
                    $set: expect.objectContaining({
                        whatsapp: '5511999999999',
                        email_general: 'gen@test.com',
                        cnpj: '11.111.111/0001-11',
                    }),
                }),
                { upsert: true },
            );
        });
    });
});
