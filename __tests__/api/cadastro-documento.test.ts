// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { fb } = vi.hoisted(() => ({ fb: { criados: [] as string[], proximo: 1 } }));

vi.mock('@/lib/firebase-admin', () => ({
    adminAuth: {
        createUser: async () => {
            const uid = `uid-${fb.proximo++}`;
            fb.criados.push(uid);
            return { uid };
        },
        getUserByEmail: async () => { throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' }); },
        updateUser: async (uid: string) => ({ uid }),
        deleteUser: async () => {},
    },
}));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { POST } from '@/app/api/cadastro/cliente/route';
import User from '@/models/User';

let srv: MongoMemoryServer;

const cadastrar = (body: Record<string, unknown>) =>
    POST(new Request('http://localhost/api/cadastro/cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }) as any);

const base = {
    tipo: 'pf',
    nome: 'Bruno Buiu',
    email: 'bruno.teste@gmail.com',
    password: 'senha123',
    telefone: '31987118711',
};

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-test' });
}, 120_000);

afterEach(async () => {
    await User.deleteMany({});
    fb.criados.length = 0;
});

afterAll(async () => {
    await mongoose.disconnect();
    await srv?.stop();
});

describe('POST /api/cadastro/cliente — documento', () => {
    it('recusa CPF com dígito verificador errado', async () => {
        const res = await cadastrar({ ...base, documento: '123.456.789-01' });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/CPF inválido/);
        // Nada foi criado em lugar nenhum.
        expect(fb.criados).toEqual([]);
        expect(await User.countDocuments({})).toBe(0);
    });

    it('recusa a sequência repetida que passava antes', async () => {
        const res = await cadastrar({ ...base, documento: '111.111.111-11' });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/CPF inválido/);
    });

    it('continua recusando quantidade de dígitos errada', async () => {
        const res = await cadastrar({ ...base, documento: '5299822472' });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/11 dígitos/);
    });

    it('recusa CNPJ inválido no cadastro PJ', async () => {
        const res = await cadastrar({ ...base, tipo: 'pj', documento: '11.222.333/0001-82' });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/CNPJ inválido/);
    });

    it('aceita CPF válido e cria a conta', async () => {
        const res = await cadastrar({ ...base, documento: '529.982.247-25' });
        expect(res.status).toBe(201);
        const salvo = await User.findOne({ email: base.email });
        expect(salvo?.cpf).toBe('52998224725');
    });

    it('aceita CNPJ válido no cadastro PJ', async () => {
        const res = await cadastrar({ ...base, tipo: 'pj', documento: '28.806.895/0001-75' });
        expect(res.status).toBe(201);
        expect((await User.findOne({ email: base.email }))?.cpf).toBe('28806895000175');
    });
});
