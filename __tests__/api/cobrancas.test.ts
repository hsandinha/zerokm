// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session, resend } = vi.hoisted(() => ({
    session: { current: null as any },
    resend: { enviados: [] as any[], falhar: false, statusPorId: {} as Record<string, string> },
}));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
vi.mock('@/lib/email/sendEmail', () => ({
    sendEmail: async (args: any) => {
        resend.enviados.push(args);
        if (resend.falhar) return { ok: false, error: 'Falha do provedor' };
        return { ok: true, id: `email-${resend.enviados.length}` };
    },
}));

// A situação da entrega é consultada no Resend na hora da listagem.
vi.stubGlobal('fetch', async (url: string) => {
    const id = String(url).split('/').pop() || '';
    return { ok: true, json: async () => ({ id, last_event: resend.statusPorId[id] || 'delivered' }) } as any;
});

import { GET as LISTAR } from '@/app/api/admin/cobrancas/route';
import { POST as REENVIAR } from '@/app/api/admin/cobrancas/[id]/reenviar/route';

let srv: MongoMemoryServer;
const USER = new mongoose.Types.ObjectId();
const PLANO = new mongoose.Types.ObjectId();
const PAG_BOLETO = new mongoose.Types.ObjectId();
const PAG_SEM_EMAIL = new mongoose.Types.ObjectId();
const PAG_PIX = new mongoose.Types.ObjectId();

const admin = { user: { email: 'admin@cnv.com.br', profile: 'administrador' } };
const lojista = { user: { email: 'lojista@cnv.com.br', profile: 'cliente' } };

const req = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const db = () => mongoose.connection.db!;

beforeAll(async () => {
    vi.stubEnv('RESEND_API_KEY', 're_teste');
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-cobrancas-test' });
    await db().collection('users').insertOne({ _id: USER, firebaseUid: 'uid-1', email: 'loja@cnv.com.br', displayName: 'Loja Teste', subscription: { expiresAt: new Date('2026-09-30') } });
    await db().collection('plans').insertOne({ _id: PLANO, name: 'Acesso Total 0KM', type: 'monthly', price: 699, active: true });
}, 120_000);

afterAll(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    await mongoose.disconnect();
    await srv?.stop();
});

beforeEach(async () => {
    resend.enviados = [];
    resend.falhar = false;
    resend.statusPorId = {};
    await db().collection('payments').deleteMany({});
    await db().collection('payments').insertMany([
        {
            _id: PAG_BOLETO, userId: USER, planId: PLANO, mpPaymentId: '111', externalReference: 'uid-1:p:monthly:boleto-renewal:2026-09-30',
            method: 'bolbradesco', status: 'pending', amount: 699, currency: 'BRL',
            boletoUrl: 'https://mp/ticket/111', boletoBarcode: '23793.38128 60007', boletoEmailSentAt: new Date('2026-09-22T03:00:00Z'),
            boletoEmailTo: 'loja@cnv.com.br', boletoEmailId: 'email-antigo', createdAt: new Date('2026-09-22'), updatedAt: new Date(),
        },
        {
            _id: PAG_SEM_EMAIL, userId: USER, planId: PLANO, mpPaymentId: '222', externalReference: 'x',
            method: 'bolbradesco', status: 'pending', amount: 499, currency: 'BRL',
            boletoUrl: 'https://mp/ticket/222', createdAt: new Date('2026-09-21'), updatedAt: new Date(),
        },
        {
            _id: PAG_PIX, userId: USER, planId: PLANO, mpPaymentId: '333', externalReference: 'y',
            method: 'pix', status: 'approved', amount: 699, currency: 'BRL', createdAt: new Date('2026-09-20'), updatedAt: new Date(),
        },
    ]);
});

describe('GET /api/admin/cobrancas', () => {
    const listar = async (qs = '') => {
        session.current = admin;
        const res = await LISTAR(req(`/api/admin/cobrancas${qs}`));
        expect(res.status).toBe(200);
        return res.json();
    };

    it('lista só boletos, com cliente, link e situação do e-mail', async () => {
        const body = await listar();
        expect(body.data.map((c: any) => c.mpPaymentId)).toEqual(['111', '222']);
        const comEmail = body.data[0];
        expect(comEmail).toMatchObject({ cliente: 'Loja Teste', plano: 'Acesso Total 0KM', boletoUrl: 'https://mp/ticket/111' });
        expect(comEmail.email).toMatchObject({ para: 'loja@cnv.com.br', situacao: 'delivered' });
    });

    it('marca quem nunca recebeu e-mail', async () => {
        const body = await listar();
        const semEmail = body.data.find((c: any) => c.mpPaymentId === '222');
        expect(semEmail.email.enviadoEm).toBeNull();
        expect(semEmail.email.situacao).toBeNull();
    });

    it('mostra quando o e-mail voltou (bounce)', async () => {
        resend.statusPorId['email-antigo'] = 'bounced';
        const body = await listar();
        expect(body.data[0].email.situacao).toBe('bounced');
    });

    it('filtra por status e por busca', async () => {
        expect((await listar('?status=approved')).data).toHaveLength(0);
        expect((await listar('?search=Loja Teste')).data).toHaveLength(2);
        expect((await listar('?search=111')).data.map((c: any) => c.mpPaymentId)).toEqual(['111']);
    });

    it('lojista não acessa', async () => {
        session.current = lojista;
        expect((await LISTAR(req('/api/admin/cobrancas'))).status).toBe(403);
    });
});

describe('POST /api/admin/cobrancas/:id/reenviar', () => {
    it('reenvia para outro e-mail e guarda o novo destino', async () => {
        session.current = admin;
        const res = await REENVIAR(req(`/api/admin/cobrancas/${PAG_BOLETO}/reenviar`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'financeiro@loja.com.br' }),
        }), params(PAG_BOLETO.toString()));
        expect(res.status).toBe(200);
        expect(resend.enviados[0].to).toBe('financeiro@loja.com.br');
        expect(resend.enviados[0].html).toContain('23793.38128 60007');

        const doc = await db().collection('payments').findOne({ _id: PAG_BOLETO });
        expect(doc?.boletoEmailTo).toBe('financeiro@loja.com.br');
        expect(doc?.boletoEmailId).toBe('email-1');
        expect(doc?.boletoEmailError).toBeNull();
    });

    it('sem e-mail no corpo, reenvia para o último destino usado', async () => {
        session.current = admin;
        await REENVIAR(req(`/api/admin/cobrancas/${PAG_BOLETO}/reenviar`, { method: 'POST' }), params(PAG_BOLETO.toString()));
        expect(resend.enviados[0].to).toBe('loja@cnv.com.br');
    });

    it('recusa e-mail inválido', async () => {
        session.current = admin;
        const res = await REENVIAR(req(`/api/admin/cobrancas/${PAG_BOLETO}/reenviar`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'nao-e-email' }),
        }), params(PAG_BOLETO.toString()));
        expect(res.status).toBe(400);
        expect(resend.enviados).toHaveLength(0);
    });

    it('cobrança sem boleto não pode ser reenviada', async () => {
        session.current = admin;
        const res = await REENVIAR(req(`/api/admin/cobrancas/${PAG_PIX}/reenviar`, { method: 'POST' }), params(PAG_PIX.toString()));
        expect(res.status).toBe(400);
    });

    it('falha do provedor devolve 502 e fica registrada', async () => {
        session.current = admin;
        resend.falhar = true;
        const res = await REENVIAR(req(`/api/admin/cobrancas/${PAG_BOLETO}/reenviar`, { method: 'POST' }), params(PAG_BOLETO.toString()));
        expect(res.status).toBe(502);
        const doc = await db().collection('payments').findOne({ _id: PAG_BOLETO });
        expect(doc?.boletoEmailError).toBe('Falha do provedor');
    });

    it('lojista não reenvia', async () => {
        session.current = lojista;
        const res = await REENVIAR(req(`/api/admin/cobrancas/${PAG_BOLETO}/reenviar`, { method: 'POST' }), params(PAG_BOLETO.toString()));
        expect(res.status).toBe(403);
    });
});
