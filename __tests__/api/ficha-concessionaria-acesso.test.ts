// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { GET as fichaGET } from '@/app/api/admin/concessionarias/[id]/ficha/route';
import { GET as atendimentoGET, PATCH as atendimentoPATCH } from '@/app/api/admin/concessionarias/[id]/atendimento/route';

const como = (profile: string | null) => { session.current = profile ? { user: { profile, email: 'x@cnv.com', uid: 'u1' } } : null; };
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (body?: unknown) => new Request('http://localhost/api', body ? { method: 'PATCH', body: JSON.stringify(body) } : undefined);

// As recusas acontecem antes de qualquer consulta ao banco (não há banco aqui).
describe('rotas da ficha da concessionária: quem entra', () => {
    it('ficha: sem sessão 401; loja, lojista e marketing 403', async () => {
        como(null);
        expect((await fichaGET(req(), params('6500000000000000000000aa'))).status).toBe(401);
        for (const perfil of ['concessionaria', 'dealership', 'cliente', 'gratis', 'marketing']) {
            como(perfil);
            expect((await fichaGET(req(), params('6500000000000000000000aa'))).status).toBe(403);
        }
    });

    it('ficha: equipe com id inválido recebe 404, sem consultar nada', async () => {
        for (const perfil of ['administrador', 'gerente', 'operador', 'vendedor', 'administrativo']) {
            como(perfil);
            expect((await fichaGET(req(), params('nao-e-id'))).status).toBe(404);
        }
    });

    it('assinatura do atendimento: só administrador', async () => {
        for (const perfil of [null, 'administrativo', 'gerente', 'operador', 'vendedor', 'concessionaria', 'cliente']) {
            como(perfil);
            expect((await atendimentoGET(req(), params('6500000000000000000000aa'))).status).toBe(403);
            expect((await atendimentoPATCH(req({ acao: 'ativar' }), params('6500000000000000000000aa'))).status).toBe(403);
        }
        como('administrador');
        expect((await atendimentoPATCH(req({ acao: 'ativar' }), params('nao-e-id'))).status).toBe(404);
    });
});
