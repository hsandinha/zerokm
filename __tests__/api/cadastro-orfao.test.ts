// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Firebase Auth em memória: guarda e-mails "existentes" e registra as chamadas,
// para conferir adoção de órfão e rollback.
const { fb } = vi.hoisted(() => ({
    fb: {
        porEmail: new Map<string, { uid: string }>(),
        criados: [] as string[],
        atualizados: [] as string[],
        apagados: [] as string[],
        proximoUid: 1,
    },
}));

vi.mock('@/lib/firebase-admin', () => ({
    adminAuth: {
        createUser: async ({ email }: any) => {
            if (fb.porEmail.has(email)) {
                const erro: any = new Error('The email address is already in use');
                erro.code = 'auth/email-already-exists';
                throw erro;
            }
            const uid = `uid-${fb.proximoUid++}`;
            fb.porEmail.set(email, { uid });
            fb.criados.push(uid);
            return { uid };
        },
        getUserByEmail: async (email: string) => {
            const encontrado = fb.porEmail.get(email);
            if (!encontrado) {
                const erro: any = new Error('not found');
                erro.code = 'auth/user-not-found';
                throw erro;
            }
            return { uid: encontrado.uid };
        },
        updateUser: async (uid: string) => { fb.atualizados.push(uid); return { uid }; },
        deleteUser: async (uid: string) => {
            fb.apagados.push(uid);
            for (const [email, v] of fb.porEmail) if (v.uid === uid) fb.porEmail.delete(email);
        },
    },
}));

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { POST } from '@/app/api/auth/register/route';
import User from '@/models/User';

let srv: MongoMemoryServer;

const EMAIL = 'brunobuiu@gmail.com';

const cadastrar = (body: any) =>
    POST(new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }));

const payload = { displayName: 'Bruno Buiu', email: EMAIL, password: 'senha123' };

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-test' });
}, 120_000);

afterEach(async () => {
    await User.deleteMany({});
    fb.porEmail.clear();
    fb.criados.length = 0;
    fb.atualizados.length = 0;
    fb.apagados.length = 0;
    vi.restoreAllMocks();
});

afterAll(async () => {
    await mongoose.disconnect();
    await srv?.stop();
});

describe('POST /api/auth/register', () => {
    it('cria a conta quando o e-mail é novo', async () => {
        const res = await cadastrar(payload);
        expect(res.status).toBe(201);

        const salvo = await User.findOne({ email: EMAIL });
        expect(salvo?.displayName).toBe('Bruno Buiu');
        expect(salvo?.firebaseUid).toBe('uid-1');
    });

    it('conclui o cadastro quando a credencial ficou órfã no Firebase', async () => {
        // Estado que travava o bot: existe no Firebase, não existe no Mongo.
        fb.porEmail.set(EMAIL, { uid: 'uid-orfao' });

        const res = await cadastrar(payload);
        expect(res.status).toBe(201);

        // Adota o uid que já existia em vez de recusar com 409.
        expect(fb.atualizados).toContain('uid-orfao');
        const salvo = await User.findOne({ email: EMAIL });
        expect(salvo?.firebaseUid).toBe('uid-orfao');
    });

    it('continua recusando quem já tem cadastro completo', async () => {
        await cadastrar(payload);
        const res = await cadastrar(payload);

        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe('Este e-mail já está cadastrado');
    });

    it('desfaz a credencial no Firebase se a gravação no Mongo falhar', async () => {
        vi.spyOn(User, 'create').mockRejectedValueOnce(new Error('mongo caiu'));

        const res = await cadastrar(payload);
        expect(res.status).toBe(500);

        // O uid criado foi apagado: o e-mail não fica preso para sempre.
        expect(fb.apagados).toEqual(fb.criados);
        expect(fb.porEmail.has(EMAIL)).toBe(false);
    });

    it('permite tentar de novo depois de uma falha no Mongo', async () => {
        vi.spyOn(User, 'create').mockRejectedValueOnce(new Error('mongo caiu'));
        expect((await cadastrar(payload)).status).toBe(500);

        vi.restoreAllMocks();
        const segunda = await cadastrar(payload);
        expect(segunda.status).toBe(201);
        expect(await User.findOne({ email: EMAIL })).not.toBeNull();
    });

    it('não apaga credencial preexistente quando adota e o Mongo falha', async () => {
        fb.porEmail.set(EMAIL, { uid: 'uid-orfao' });
        vi.spyOn(User, 'create').mockRejectedValueOnce(new Error('mongo caiu'));

        expect((await cadastrar(payload)).status).toBe(500);
        expect(fb.apagados).toEqual([]);
        expect(fb.porEmail.has(EMAIL)).toBe(true);
    });
});
