// @vitest-environment node
// Instagram e Messenger pelo Chatrun Conexão (e o CNV como dono "cnv"):
// conexão vira canal sem token, o Direct entra no pipeline e o envio sai
// pela API do gateway. O gateway é um fetch falso que grava as chamadas.
import { createHmac } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { NextRequest } from 'next/server';

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
const escopo = vi.hoisted(() => ({ tenantId: '' as string | null, email: 'gestor@loja.com' }));
vi.mock('@wa/lib/scope', () => ({
    requireScopeAdmin: async () => ({ tenantId: escopo.tenantId, email: escopo.email, name: 'Gestor', role: 'admin', store: null }),
}));

import { WaChannel } from '@wa/models/channel';
import { WaStore } from '@wa/models/store';
import { WaContact, WaConversation, WaMessage, WaSettings } from '@wa/models/wa';
import { resolveChannel } from '@wa/lib/channels';
import { upsertChatrunChannel } from '@wa/lib/chatrun-channels';
import { igSendText, igReact } from '@wa/lib/instagram';
import { fbSendText, fbTypingOn } from '@wa/lib/messenger';
import { POST as eventos } from '@/app/api/chatrun/eventos/route';
import { GET as conectarInstagram } from '@/app/api/wa/instagram/connect/route';
import { GET as voltaInstagram } from '@/app/api/wa/instagram/callback/route';
import { GET as voltaMessenger } from '@/app/api/wa/messenger/callback/route';

const SEGREDO = 'segredo-de-teste';
process.env.CHATRUN_API_KEY = 'crk_test_123';
process.env.CHATRUN_CALLBACK_SECRET = SEGREDO;
process.env.CHATRUN_URL = 'https://gateway.teste';
delete process.env.CRON_SECRET;

let srv: MongoMemoryServer | null = null;
let loja: string;
type Chamada = { url: string; method: string; body: any };
let chamadas: Chamada[] = [];
let resposta: (c: Chamada) => { status: number; body: unknown } = () => ({ status: 200, body: {} });
const fetchOriginal = globalThis.fetch;

beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI;
    if (!uri) srv = await MongoMemoryServer.create();
    await mongoose.connect(uri ?? srv!.getUri(), { dbName: `zk-perfis-${Date.now()}` });
    loja = String((await WaStore.create({ kind: 'lojista', name: 'Loja Perfis', members: [] } as any))._id);
    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input);
        if (!url.startsWith('https://gateway.teste')) throw new Error(`fetch inesperado: ${url}`);
        const c: Chamada = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : null };
        chamadas.push(c);
        const r = resposta(c);
        return new Response(JSON.stringify(r.body), { status: r.status });
    }) as typeof fetch;
}, 120_000);

afterAll(async () => {
    globalThis.fetch = fetchOriginal;
    await mongoose.connection.db?.dropDatabase().catch(() => {});
    await mongoose.disconnect();
    await srv?.stop();
});

beforeEach(() => {
    chamadas = [];
    resposta = () => ({ status: 200, body: {} });
    escopo.tenantId = loja;
});

function assinado(evento: Record<string, unknown>) {
    const corpo = JSON.stringify(evento);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac('sha256', SEGREDO).update(`${ts}.${corpo}`).digest('hex');
    return new Request('https://www.cnv0km.com.br/api/chatrun/eventos', {
        method: 'POST', body: corpo,
        headers: { 'x-chatrun-timestamp': ts, 'x-chatrun-signature': `sha256=${sig}` },
    });
}

const ig = { id: 'conn-ig', account_id: 'acc-1', channel: 'instagram' as const, status: 'connected' as const, ig_user_id: '1784', ig_username: 'lojaperfis' };
const fb = { id: 'conn-fb', account_id: 'acc-1', channel: 'messenger' as const, status: 'connected' as const, fb_page_id: '5550', fb_page_name: 'Loja Perfis Página' };

describe('Instagram e Messenger viram canal sem token', () => {
    it('Instagram', async () => {
        expect(await upsertChatrunChannel(ig, loja)).toMatchObject({ ok: true, status: 'connected' });
        const doc = await WaChannel.findOne({ chatrunConnectionId: 'conn-ig' });
        expect(doc).toMatchObject({ kind: 'instagram', provider: 'chatrun', tenantId: loja, igUserId: '1784', igUsername: 'lojaperfis' });
        expect(doc!.igToken).toBeUndefined();
        expect(resolveChannel(doc!).ig).toEqual({ userId: '1784', token: '', chatrunConnectionId: 'conn-ig' });
    });

    it('Messenger', async () => {
        expect(await upsertChatrunChannel(fb, loja)).toMatchObject({ ok: true, status: 'connected' });
        const doc = await WaChannel.findOne({ chatrunConnectionId: 'conn-fb' });
        expect(doc).toMatchObject({ kind: 'messenger', fbPageId: '5550', fbPageName: 'Loja Perfis Página' });
        expect(resolveChannel(doc!).fb).toEqual({ pageId: '5550', token: '', chatrunConnectionId: 'conn-fb' });
    });
});

describe('Direct e Messenger chegando pelo gateway', () => {
    it('mensagem do Instagram entra na conversa da loja com o @ da pessoa', async () => {
        const res = await eventos(assinado({
            type: 'message.received', connection: { ...ig, external_ref: loja },
            data: {
                channel: 'instagram',
                message: { wamid: 'mid.IG1', type: 'text', text: 'Quanto está o Pulse?', media_url: null },
                contact: { phone: 'ig:9001', ig_id: '9001', username: 'cliente.ig', name: null },
            },
        }));
        expect(res.status).toBe(200);
        const contato = await WaContact.findOne({ phone: 'ig:9001' }).lean();
        expect(contato).toMatchObject({ tenantId: loja, name: '@cliente.ig' });
        expect(await WaMessage.findOne({ externalId: 'mid.IG1' }).lean()).toMatchObject({ direction: 'inbound', content: 'Quanto está o Pulse?' });
    });

    it('imagem no Messenger vira mensagem de imagem', async () => {
        await eventos(assinado({
            type: 'message.received', connection: { ...fb, external_ref: loja },
            data: {
                channel: 'messenger',
                message: { wamid: 'mid.FB1', type: 'image', text: null, media_url: 'https://cdn.meta/x.jpg' },
                contact: { phone: 'fb:7007', fb_id: '7007', name: 'Maria Messenger' },
            },
        }));
        const contato = await WaContact.findOne({ phone: 'fb:7007' }).lean();
        expect(contato?.name).toBe('Maria Messenger');
        expect(await WaMessage.exists({ externalId: 'mid.FB1' })).toBeTruthy();
    });

    it('eco do app (a equipe respondeu pela Página) vira fala humana e pausa a IA', async () => {
        await eventos(assinado({
            type: 'message.echo', connection: { ...fb, external_ref: loja },
            data: {
                channel: 'messenger',
                message: { wamid: 'mid.ECO1', type: 'text', text: 'Oi Maria, aqui é o João da loja' },
                contact: { phone: 'fb:7007', fb_id: '7007', name: 'Maria Messenger' },
            },
        }));
        const eco = await WaMessage.findOne({ externalId: 'mid.ECO1' }).lean();
        expect(eco).toMatchObject({ direction: 'outbound', sender: 'human' });
        const conversa = await WaConversation.findOne({ _id: eco!.conversationId }).lean();
        expect(conversa?.status).toBe('human_active');
    }, 15_000);
});

describe('envio pelo gateway', () => {
    it('Direct vai para ig:<id>', async () => {
        resposta = () => ({ status: 201, body: { message: { wamid: 'mid.OUT.IG' } } });
        const r = await igSendText({ userId: '1784', token: '', chatrunConnectionId: 'conn-ig' }, '9001', 'Está R$ 120 mil');
        expect(r.external_id).toBe('mid.OUT.IG');
        expect(chamadas[0].body).toEqual({ connection_id: 'conn-ig', to: 'ig:9001', type: 'text', text: 'Está R$ 120 mil' });
    });

    it('Messenger vai para fb:<PSID> com a tag de atendimento humano quando pedida', async () => {
        resposta = () => ({ status: 201, body: { message: { wamid: 'mid.OUT.FB' } } });
        await fbSendText({ pageId: '5550', token: '', chatrunConnectionId: 'conn-fb' }, '7007', 'Oi!', { humanAgent: true });
        expect(chamadas[0].body).toEqual({ connection_id: 'conn-fb', to: 'fb:7007', human_agent: true, type: 'text', text: 'Oi!' });
    });

    it('"digitando" no Messenger marca a última mensagem como vista', async () => {
        await fbTypingOn({ pageId: '5550', token: '', chatrunConnectionId: 'conn-fb' }, '7007', 'mid.FB1');
        expect(chamadas[0]).toMatchObject({ url: 'https://gateway.teste/api/v1/messages/read', body: { connection_id: 'conn-fb', wamid: 'mid.FB1', typing: true } });
    });

    it('reação no Direct avisa que não existe pelo Chatrun (sem chamar o gateway)', async () => {
        await expect(igReact({ userId: '1784', token: '', chatrunConnectionId: 'conn-ig' }, '9001', 'mid.IG1')).rejects.toMatchObject({ status: 422 });
        expect(chamadas).toHaveLength(0);
    });
});

describe('conectar pela página do Chatrun', () => {
    it('"Conectar Instagram" leva ao convite do gateway com a loja no external_ref', async () => {
        await WaStore.updateOne({ _id: loja }, { chatrunAccountId: 'acc-1' });
        resposta = (c) => c.url.endsWith('/invites')
            ? { status: 200, body: { url: 'https://gateway.teste/conectar/ig' } }
            : { status: 200, body: { account: { id: 'acc-1' } } };
        const res = await conectarInstagram(new NextRequest('https://www.cnv0km.com.br/api/wa/instagram/connect'));
        expect(res.headers.get('location')).toBe('https://gateway.teste/conectar/ig');
        const convite = chamadas.find((c) => c.url.endsWith('/invites'))!;
        expect(convite.body).toMatchObject({ account_id: 'acc-1', channel: 'instagram', external_ref: loja, return_url: 'https://www.cnv0km.com.br/api/wa/instagram/callback' });
    });

    it('a volta do Instagram sincroniza e mostra o resultado na Configuração', async () => {
        resposta = () => ({ status: 200, body: { connections: [{ ...ig, external_ref: loja }] } });
        const res = await voltaInstagram(new NextRequest('https://www.cnv0km.com.br/api/wa/instagram/callback?status=ok&channel=instagram&connection_id=conn-ig&account_id=acc-1&ig_username=lojaperfis'));
        expect(res.headers.get('location')).toBe('https://www.cnv0km.com.br/dashboard/atendimento/configuracao?instagram=ok&ig=lojaperfis');
        expect(chamadas[0].url).toBe(`https://gateway.teste/api/v1/connections?channel=instagram&external_ref=${loja}`);
    });

    it('erro na página do Chatrun volta com o motivo', async () => {
        const res = await voltaMessenger(new NextRequest('https://www.cnv0km.com.br/api/wa/messenger/callback?status=erro&channel=messenger&mensagem=Sem+Página'));
        expect(res.headers.get('location')).toBe('https://www.cnv0km.com.br/dashboard/atendimento/configuracao?messenger=erro&why=Sem+P%C3%A1gina');
    });
});

describe('o CNV (Vera) como dono "cnv"', () => {
    it('conectar o WhatsApp da Vera pelo Chatrun converte o canal que já existe', async () => {
        const antigo = await WaChannel.create({ kind: 'whatsapp', tenantId: null, status: 'connected', phoneNumberId: '1000', token: 'tok-antigo' } as any);
        const r = await upsertChatrunChannel({ id: 'conn-vera', account_id: 'acc-cnv', channel: 'whatsapp', status: 'connected', phone_number_id: '2000', display_phone: '+55 31 4000-0000' }, 'cnv');
        expect(r).toMatchObject({ ok: true, channelId: String(antigo._id) });
        const doc = await WaChannel.findById(antigo._id).lean();
        expect(doc).toMatchObject({ tenantId: null, provider: 'chatrun', chatrunConnectionId: 'conn-vera', phoneNumberId: '2000' });
        expect(doc?.token).toBeUndefined();
        expect(await WaChannel.countDocuments({ kind: 'whatsapp', tenantId: null })).toBe(1);
    });

    it('o convite do Instagram da Vera usa "cnv" e a conta guardada nas configurações', async () => {
        escopo.tenantId = null;
        await WaSettings.create({ chatrunAccountId: 'acc-cnv' } as any);
        resposta = (c) => c.url.endsWith('/invites')
            ? { status: 200, body: { url: 'https://gateway.teste/conectar/vera' } }
            : { status: 200, body: { account: { id: 'acc-cnv' } } };
        const res = await conectarInstagram(new NextRequest('https://www.cnv0km.com.br/api/wa/instagram/connect'));
        expect(res.headers.get('location')).toBe('https://gateway.teste/conectar/vera');
        expect(chamadas.find((c) => c.url.endsWith('/invites'))!.body).toMatchObject({ account_id: 'acc-cnv', external_ref: 'cnv' });
    });
});
