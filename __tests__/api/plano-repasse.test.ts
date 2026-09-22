// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session, mp } = vi.hoisted(() => ({
    session: { current: null as any },
    mp: { payment: null as any, posted: [] as any[] },
}));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
vi.mock('@/lib/mercadopago', async (importOriginal) => {
    const original = await importOriginal<typeof import('@/lib/mercadopago')>();
    return {
        ...original,
        getPayment: async () => ({ ok: true, status: 200, data: mp.payment }),
        mpPost: async (path: string, body: any) => {
            mp.posted.push({ path, body });
            return { ok: true, status: 201, data: { id: 987654, point_of_interaction: { transaction_data: { qr_code: 'PIXCODE', qr_code_base64: 'QkFTRTY0' } } } };
        },
    };
});

import { POST as WEBHOOK } from '@/app/api/webhooks/mercadopago/route';
import { PATCH as ADMIN_PLANO } from '@/app/api/admin/concessionarias/[id]/plano-repasse/route';
import { POST as PIX_LOJA } from '@/app/api/checkout/plano-repasse/pix/route';
import { GET as PLANO_LOJA } from '@/app/api/dealership/plano-repasse/route';
import { POST as PIX_LOJISTA } from '@/app/api/checkout/pix/route';
import { POST as CRIAR_PLANO } from '@/app/api/admin/plans/route';

let srv: MongoMemoryServer;

const LOJA = new mongoose.Types.ObjectId();
const USER_LOJA = new mongoose.Types.ObjectId();
const PLANO_LOJA_ID = new mongoose.Types.ObjectId();
const PLANO_LOJA_SEM_ANUAL = new mongoose.Types.ObjectId();
const PLANO_LOJISTA_ID = new mongoose.Types.ObjectId();

const admin = { user: { email: 'admin@cnv.com.br', profile: 'administrador', allowedProfiles: ['administrador'] } };
const operador = { user: { email: 'op@cnv.com.br', profile: 'operador', allowedProfiles: ['operador'] } };
const dono = { user: { uid: 'uid-loja', email: 'loja@cnv.com.br', profile: 'concessionaria', allowedProfiles: ['concessionaria'] } };
const lojista = { user: { uid: 'uid-lojista', email: 'lojista@cnv.com.br', profile: 'cliente', allowedProfiles: ['cliente'] } };

function req(path: string, init?: RequestInit) {
    return new Request(`http://localhost${path}`, init);
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const db = () => mongoose.connection.db!;
const loja = () => db().collection('concessionarias').findOne({ _id: LOJA });

async function webhookPagamento(payment: any) {
    mp.payment = payment;
    const res = await WEBHOOK(req('/api/webhooks/mercadopago', json('POST', { type: 'payment', data: { id: String(payment.id) } })) as any);
    expect(res.status).toBe(200);
}

beforeAll(async () => {
    vi.stubEnv('MP_ACCESS_TOKEN', 'TEST-token');
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-plano-repasse-test' });
    await db().collection('users').insertMany([
        { _id: USER_LOJA, firebaseUid: 'uid-loja', email: 'loja@cnv.com.br', dealershipId: LOJA, allowedProfiles: ['concessionaria'], defaultProfile: 'concessionaria', cpf: '52998224725' },
        { firebaseUid: 'uid-lojista', email: 'lojista@cnv.com.br', allowedProfiles: ['cliente'], cpf: '52998224725' },
    ]);
    await db().collection('plans').insertMany([
        { _id: PLANO_LOJA_ID, name: 'Repasse Mensal', publico: 'concessionaria', type: 'monthly', price: 199, annualPrice: 1990, active: true },
        { _id: PLANO_LOJA_SEM_ANUAL, name: 'Repasse Básico', publico: 'concessionaria', type: 'monthly', price: 99, annualPrice: null, active: true },
        { _id: PLANO_LOJISTA_ID, name: 'Acesso Total 0KM', type: 'monthly', price: 699, active: true },
    ]);
}, 120_000);

afterAll(async () => {
    vi.unstubAllEnvs();
    await mongoose.disconnect();
    await srv?.stop();
});

beforeEach(async () => {
    mp.posted = [];
    await db().collection('concessionarias').deleteMany({});
    await db().collection('payments').deleteMany({});
    await db().collection('transactions').deleteMany({});
    await db().collection('concessionarias').insertOne({ _id: LOJA, nome: 'Loja Teste', razaoSocial: 'Loja Teste LTDA', cnpj: '11222333000181', ativo: true });
});

describe('webhook Mercado Pago — pagamento do plano de repasse', () => {
    const pagamento = (over: Record<string, unknown> = {}) => ({
        id: 5550001,
        status: 'approved',
        payment_method_id: 'pix',
        payment_type_id: 'bank_transfer',
        transaction_amount: 199,
        external_reference: `DEALERPLAN:${LOJA}:${PLANO_LOJA_ID}:monthly:${USER_LOJA}`,
        payer: { email: 'loja@cnv.com.br' },
        ...over,
    });

    it('aprovado ativa o plano na loja e registra pagamento e transação', async () => {
        await webhookPagamento(pagamento());
        const conc = await loja();
        expect(conc?.planoRepasse).toMatchObject({ status: 'active', planName: 'Repasse Mensal', activationMethod: 'pix', lastPaymentId: '5550001' });
        expect(new Date(conc!.planoRepasse.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 864e5);

        const pay = await db().collection('payments').findOne({ mpPaymentId: '5550001' });
        expect(pay).toMatchObject({ status: 'approved', amount: 199 });
        expect(String(pay?.concessionariaId)).toBe(String(LOJA));
        expect(await db().collection('transactions').countDocuments({ referenceId: '5550001', status: 'paid' })).toBe(1);
    });

    it('não troca o perfil do usuário da loja para cliente', async () => {
        await webhookPagamento(pagamento());
        const user = await db().collection('users').findOne({ _id: USER_LOJA });
        expect(user?.defaultProfile).toBe('concessionaria');
        expect(user?.allowedProfiles).toEqual(['concessionaria']);
        expect(user?.subscription).toBeUndefined();
    });

    it('webhook repetido não soma 30 dias de novo', async () => {
        await webhookPagamento(pagamento());
        const primeira = (await loja())!.planoRepasse.expiresAt;
        await webhookPagamento(pagamento());
        expect((await loja())!.planoRepasse.expiresAt.getTime()).toBe(new Date(primeira).getTime());
    });

    it('renovação com outro pagamento soma ao período atual', async () => {
        await webhookPagamento(pagamento());
        const primeira = new Date((await loja())!.planoRepasse.expiresAt).getTime();
        await webhookPagamento(pagamento({ id: 5550002 }));
        expect(new Date((await loja())!.planoRepasse.expiresAt).getTime() - primeira).toBe(30 * 864e5);
    });

    it('pendente só registra o pagamento', async () => {
        await webhookPagamento(pagamento({ status: 'pending' }));
        expect((await loja())?.planoRepasse).toBeUndefined();
        expect(await db().collection('payments').countDocuments({ status: 'pending' })).toBe(1);
    });

    it('referência com plano de lojista não ativa nada', async () => {
        await webhookPagamento(pagamento({ external_reference: `DEALERPLAN:${LOJA}:${PLANO_LOJISTA_ID}:monthly:${USER_LOJA}` }));
        expect((await loja())?.planoRepasse).toBeUndefined();
    });
});

describe('admin — ativação manual do plano de repasse', () => {
    const patch = (body: unknown) => ADMIN_PLANO(req(`/api/admin/concessionarias/${LOJA}/plano-repasse`, json('PATCH', body)), { params: Promise.resolve({ id: LOJA.toString() }) });

    it('administrador ativa como cortesia e depois desativa', async () => {
        session.current = admin;
        const res = await patch({ acao: 'ativar', planId: PLANO_LOJA_ID.toString(), billingType: 'monthly', metodo: 'cortesia' });
        expect(res.status).toBe(200);
        expect((await res.json()).plano).toMatchObject({ ativo: true, activationMethod: 'cortesia' });

        const off = await patch({ acao: 'desativar' });
        expect((await off.json()).plano).toMatchObject({ ativo: false, status: 'cancelled' });
    });

    it('recusa plano de lojista', async () => {
        session.current = admin;
        expect((await patch({ acao: 'ativar', planId: PLANO_LOJISTA_ID.toString() })).status).toBe(400);
    });

    it('operador não ativa (mesma regra do CRM)', async () => {
        session.current = operador;
        expect((await patch({ acao: 'ativar', planId: PLANO_LOJA_ID.toString() })).status).toBe(403);
    });
});

describe('concessionária — contratar por PIX', () => {
    const pix = (body: unknown) => PIX_LOJA(req('/api/checkout/plano-repasse/pix', json('POST', body)));

    it('gera PIX no CNPJ da loja com referência DEALERPLAN', async () => {
        session.current = dono;
        const res = await pix({ planId: PLANO_LOJA_ID.toString(), billingType: 'annual' });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ qrCode: 'PIXCODE', amount: 1990 });
        const body = mp.posted[0].body;
        expect(body.external_reference).toBe(`DEALERPLAN:${LOJA}:${PLANO_LOJA_ID}:annual:${USER_LOJA}`);
        expect(body.payer.identification).toEqual({ type: 'CNPJ', number: '11222333000181' });
        expect(body.transaction_amount).toBe(1990);
    });

    it('recusa anual em plano sem preço anual', async () => {
        session.current = dono;
        expect((await pix({ planId: PLANO_LOJA_SEM_ANUAL.toString(), billingType: 'annual' })).status).toBe(400);
        expect(mp.posted).toHaveLength(0);
    });

    it('recusa plano de lojista', async () => {
        session.current = dono;
        expect((await pix({ planId: PLANO_LOJISTA_ID.toString() })).status).toBe(400);
    });

    it('lojista não contrata plano de repasse', async () => {
        session.current = lojista;
        expect((await pix({ planId: PLANO_LOJA_ID.toString() })).status).toBe(403);
    });

    it('painel lista só planos de concessionária', async () => {
        session.current = dono;
        const body = await (await PLANO_LOJA(req('/api/dealership/plano-repasse'))).json();
        expect(body.planos.map((p: any) => p.name).sort()).toEqual(['Repasse Básico', 'Repasse Mensal']);
        expect(body.plano.ativo).toBe(false);
    });
});

describe('lojista — plano de concessionária fica fora', () => {
    it('checkout PIX do lojista recusa plano de concessionária', async () => {
        session.current = lojista;
        const res = await PIX_LOJISTA(req('/api/checkout/pix', json('POST', { planId: PLANO_LOJA_ID.toString() })) as any);
        expect(res.status).toBe(400);
        expect(mp.posted).toHaveLength(0);
    });

    it('criar plano de concessionária força mensal, sem convidado e sem destaque', async () => {
        session.current = admin;
        const res = await CRIAR_PLANO(req('/api/admin/plans', json('POST', {
            name: 'Repasse Pro', publico: 'concessionaria', type: 'credits', credits: 10, price: 299, invitePrice: 9.9, popular: true, active: true,
        })));
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ publico: 'concessionaria', type: 'monthly', invitePrice: 0, popular: false });
    });
});
