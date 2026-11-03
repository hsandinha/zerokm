// @vitest-environment node
// "Conectar WhatsApp" da loja pelo Chatrun: convite com a loja no
// external_ref e volta para a Configuração; o retorno vira canal.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
const escopo = vi.hoisted(() => ({ tenantId: '' }));
vi.mock('@wa/lib/scope', () => ({
    requireScopeAdmin: async () => ({ tenantId: escopo.tenantId, email: 'gestor@loja.com', name: 'Gestor', role: 'admin', store: null }),
}));

import { WaChannel } from '@wa/models/channel';
import { WaStore } from '@wa/models/store';
import { GET, POST } from '@/app/api/wa/whatsapp/connect/route';

process.env.CHATRUN_API_KEY = 'crk_test_123';
process.env.CHATRUN_URL = 'https://gateway.teste';

let srv: MongoMemoryServer | null = null;
const chamadas: Array<{ url: string; method: string; body: any }> = [];
const fetchOriginal = globalThis.fetch;

beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI;
    if (!uri) srv = await MongoMemoryServer.create();
    await mongoose.connect(uri ?? srv!.getUri(), { dbName: `zk-conectar-${Date.now()}` });
    const loja = await WaStore.create({ kind: 'concessionaria', name: 'Concessionária Centro', members: [] } as any);
    escopo.tenantId = String(loja._id);

    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(init.body) : null;
        chamadas.push({ url, method: init?.method ?? 'GET', body });
        const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
        if (url.endsWith('/api/v1/accounts/resolve')) return json({ account: { id: 'acc-9' }, created: true });
        if (url.endsWith('/api/v1/invites')) return json({ url: 'https://gateway.teste/conectar/tok', channel: 'whatsapp' });
        if (url.includes('/api/v1/connections?')) {
            return json({ connections: [{ id: 'conn-9', account_id: 'acc-9', channel: 'whatsapp', status: 'connected', phone_number_id: '9999', display_phone: '+55 31 3333-0000', external_ref: escopo.tenantId }] });
        }
        throw new Error(`fetch inesperado: ${url}`);
    }) as typeof fetch;
}, 120_000);

afterAll(async () => {
    globalThis.fetch = fetchOriginal;
    await mongoose.connection.db?.dropDatabase().catch(() => {});
    await mongoose.disconnect();
    await srv?.stop();
});

const pedido = (body: unknown) =>
    new Request('https://www.cnv0km.com.br/api/wa/whatsapp/connect', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { host: 'www.cnv0km.com.br', 'x-forwarded-proto': 'https' },
    }) as any;

describe('conectar WhatsApp da loja pelo Chatrun', () => {
    it('o convite leva a loja no external_ref e volta para a Configuração', async () => {
        const res = await POST(pedido({ acao: 'convite' }));
        expect(await res.json()).toEqual({ url: 'https://gateway.teste/conectar/tok' });
        expect(chamadas[0].body).toEqual({ email: 'gestor@loja.com', name: 'Concessionária Centro' });
        expect(chamadas[1].body).toEqual({
            account_id: 'acc-9',
            channel: 'whatsapp',
            external_ref: escopo.tenantId,
            return_url: 'https://www.cnv0km.com.br/dashboard/atendimento/configuracao?whatsapp=retorno',
            ttl_hours: 24,
        });
        expect((await WaStore.findById(escopo.tenantId).lean())?.chatrunAccountId).toBe('acc-9');
    });

    it('o segundo convite usa a conta guardada', async () => {
        chamadas.length = 0;
        await POST(pedido({ acao: 'convite' }));
        expect(chamadas[0].body).toEqual({ account_id: 'acc-9' });
    });

    it('o retorno cria o canal da loja sem token', async () => {
        const res = await POST(pedido({ acao: 'retorno', accountId: 'acc-9' }));
        expect(await res.json()).toEqual({ ok: true, conectados: 1, aviso: null });
        const canal = await WaChannel.findOne({ chatrunConnectionId: 'conn-9' }).lean();
        expect(canal).toMatchObject({ tenantId: escopo.tenantId, provider: 'chatrun', status: 'connected', phoneNumberId: '9999' });
        expect(canal?.token).toBeUndefined();
    });

    it('a tela sabe que o Chatrun está configurado', async () => {
        const res = await GET();
        expect(await res.json()).toEqual({ chatrun: true, aviso: null });
    });
});
