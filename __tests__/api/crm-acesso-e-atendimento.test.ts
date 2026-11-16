// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Tudo mockado: nada de Mongo nem de Firebase de verdade.
const { estado } = vi.hoisted(() => ({
    estado: {
        perfil: 'administrador' as string | null,
        usuario: null as any,
        loja: null as any,
        senhas: [] as Array<{ uid: string; password?: string }>,
        marcados: [] as any[],
    },
}));

const ID = '64b7f0c2a1b2c3d4e5f60718';

vi.mock('next-auth', () => ({
    getServerSession: vi.fn(async () => (estado.perfil ? { user: { profile: estado.perfil, email: 'equipe@cnv.com.br' } } : null)),
}));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn(async () => undefined) }));
vi.mock('@/lib/firebase-admin', () => ({
    adminAuth: { updateUser: vi.fn(async (uid: string, dados: { password?: string }) => { estado.senhas.push({ uid, ...dados }); }) },
}));
vi.mock('@/models/User', () => ({
    default: {
        findById: vi.fn(() => ({ select: () => ({ lean: async () => estado.usuario }) })),
        updateOne: vi.fn(async (...args: any[]) => { estado.marcados.push(args); }),
    },
}));
vi.mock('@wa/models/store', () => ({ WaStore: { findOne: vi.fn(async () => estado.loja) } }));
vi.mock('@wa/lib/store', () => ({
    storeAccess: () => ({ active: true, trial: true, trialEndsAt: '2026-12-01T00:00:00.000Z', expiresAt: null, planName: null }),
}));

import { POST as definirSenha } from '@/app/api/admin/crm/acesso/route';
import { GET as lojaDeAtendimento } from '@/app/api/admin/clientes/[id]/atendimento/route';
import { gerarSenhaProvisoria } from '@/lib/utils/senhaProvisoria';

const pedir = (body: unknown) => definirSenha(new Request('http://x/api/admin/crm/acesso', { method: 'POST', body: JSON.stringify(body) }));
const verLoja = (id = ID) => lojaDeAtendimento(new Request('http://x'), { params: Promise.resolve({ id }) });

beforeEach(() => {
    estado.perfil = 'administrador';
    estado.usuario = { _id: ID, firebaseUid: 'fb-1', allowedProfiles: ['gratis'], email: 'loja@x.com' };
    estado.loja = null;
    estado.senhas = [];
    estado.marcados = [];
});

describe('POST /api/admin/crm/acesso', () => {
    it('recusa quem não é administrador, como as outras rotas do CRM', async () => {
        for (const perfil of ['administrativo', 'gerente', 'operador', 'cliente', null]) {
            estado.perfil = perfil;
            const res = await pedir({ userId: ID });
            expect(res.status).toBe(403);
        }
        expect(estado.senhas).toHaveLength(0);
    });

    it('gera a senha, grava no login e obriga a troca no primeiro acesso', async () => {
        const res = await pedir({ userId: ID });
        const data = await res.json();
        expect(res.status).toBe(200);
        expect(data.senhaProvisoria).toMatch(/^[a-z2-9]{8}$/);
        expect(estado.senhas).toEqual([{ uid: 'fb-1', password: data.senhaProvisoria }]);
        expect(estado.marcados[0][1]).toEqual({ $set: { forcePasswordChange: true } });
    });

    it('aceita a senha definida pela equipe e recusa senha curta', async () => {
        expect((await (await pedir({ userId: ID, senha: 'loja2026' })).json()).senhaProvisoria).toBe('loja2026');
        const curta = await pedir({ userId: ID, senha: '123' });
        expect(curta.status).toBe(400);
        expect(estado.senhas).toHaveLength(1);
    });

    it('não troca senha de quem não é lojista', async () => {
        estado.usuario = { _id: ID, firebaseUid: 'fb-2', allowedProfiles: ['administrador'], email: 'chefe@cnv.com.br' };
        const res = await pedir({ userId: ID });
        expect(res.status).toBe(400);
        expect(estado.senhas).toHaveLength(0);
    });

    it('responde 404 para id inválido ou cliente inexistente', async () => {
        expect((await pedir({ userId: 'abc' })).status).toBe(404);
        estado.usuario = null;
        expect((await pedir({ userId: ID })).status).toBe(404);
    });
});

describe('GET /api/admin/clientes/[id]/atendimento', () => {
    it('recusa quem não é administrador', async () => {
        estado.perfil = 'administrativo';
        expect((await verLoja()).status).toBe(403);
    });

    it('devolve loja nula quando o lojista ainda não entrou no atendimento', async () => {
        expect(await (await verLoja()).json()).toEqual({ loja: null });
    });

    it('devolve a situação da assinatura do atendimento', async () => {
        estado.loja = { _id: 'loja1', name: 'Bravo', ai: { active: true, token: 't' } };
        const { loja } = await (await verLoja()).json();
        expect(loja).toMatchObject({ id: 'loja1', name: 'Bravo', aiActive: true, access: { active: true, trial: true } });
    });
});

describe('gerarSenhaProvisoria', () => {
    it('gera senhas diferentes, sem caracteres ambíguos', () => {
        const senhas = new Set(Array.from({ length: 20 }, () => gerarSenhaProvisoria()));
        expect(senhas.size).toBeGreaterThan(15);
        for (const s of senhas) expect(s).toMatch(/^[abcdefghijkmnpqrstuvwxyz23456789]{8}$/);
    });
});
