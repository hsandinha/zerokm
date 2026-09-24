import { beforeEach, describe, expect, it, vi } from 'vitest';
const { session, query } = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: session }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/services/fipeService', async importOriginal => ({ ...await importOriginal<object>(), queryFipe: query }));
import { GET } from '@/app/api/catalog/fipe/route';
beforeEach(() => { vi.clearAllMocks(); });
describe('API do catálogo FIPE', () => {
    it('exige sessão e perfil autorizado', async () => {
        session.mockResolvedValue(null);
        expect((await GET(new Request('http://localhost/api/catalog/fipe'))).status).toBe(401);
        session.mockResolvedValue({ user: { profile: 'client' } });
        expect((await GET(new Request('http://localhost/api/catalog/fipe'))).status).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });
    it('rejeita identificadores arbitrários e trata falhas do fornecedor', async () => {
        session.mockResolvedValue({ user: { profile: 'administrador' } });
        expect((await GET(new Request('http://localhost/api/catalog/fipe?brand=../x'))).status).toBe(400);
        expect(query).not.toHaveBeenCalled();
        query.mockRejectedValue(Error('Limite atingido'));
        const response = await GET(new Request('http://localhost/api/catalog/fipe?brand=56'));
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: 'Limite atingido' });
    });
});
