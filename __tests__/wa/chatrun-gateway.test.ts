// @vitest-environment node
// WhatsApp das lojas pelo Chatrun Conexão: canal sem token, eventos
// assinados entrando pela mesma pipeline do webhook da Meta e envio/modelos
// saindo pela API do gateway. O gateway é um fetch falso que grava as chamadas.
import { createHmac } from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { WaChannel } from '@wa/models/channel';
import { WaStore } from '@wa/models/store';
import { WaContact, WaConversation, WaMessage } from '@wa/models/wa';
import { resolveChannel } from '@wa/lib/channels';
import { upsertChatrunChannel } from '@wa/lib/chatrun-channels';
import { createTemplate, listTemplates, MetaApiError, sendTemplate, sendText } from '@wa/lib/meta';
import { POST as eventos } from '@/app/api/chatrun/eventos/route';
import { POST as webhookMeta } from '@/app/api/webhooks/meta/route';

const SEGREDO = 'segredo-de-teste';
process.env.CHATRUN_API_KEY = 'crk_test_123';
process.env.CHATRUN_CALLBACK_SECRET = SEGREDO;
process.env.CHATRUN_URL = 'https://gateway.teste';
process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);
delete process.env.META_APP_SECRET;
delete process.env.CRON_SECRET;

let srv: MongoMemoryServer | null = null;
let lojaA: string;
let lojaB: string;

type Chamada = { url: string; method: string; body: any };
let chamadas: Chamada[] = [];
let resposta: (c: Chamada) => { status: number; body: unknown } = () => ({ status: 200, body: {} });

const fetchOriginal = globalThis.fetch;

beforeAll(async () => {
    const uri = process.env.TEST_MONGO_URI;
    if (!uri) srv = await MongoMemoryServer.create();
    await mongoose.connect(uri ?? srv!.getUri(), { dbName: `zk-chatrun-${Date.now()}` });
    const a = await WaStore.create({ kind: 'lojista', name: 'Loja A', members: [] } as any);
    const b = await WaStore.create({ kind: 'lojista', name: 'Loja B', members: [] } as any);
    lojaA = String(a._id);
    lojaB = String(b._id);

    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input);
        const c: Chamada = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : null };
        if (!url.startsWith('https://gateway.teste')) throw new Error(`fetch inesperado: ${url}`);
        chamadas.push(c);
        const r = resposta(c);
        return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
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
});

const conexao = (extra: Record<string, unknown> = {}) => ({
    id: 'conn-1',
    account_id: 'acc-1',
    channel: 'whatsapp' as const,
    status: 'connected' as const,
    phone_number_id: '1111',
    waba_id: '2222',
    display_phone: '+55 31 99999-0000',
    verified_name: 'Loja A Veículos',
    ...extra,
});

function assinado(evento: Record<string, unknown>, segredo = SEGREDO) {
    const corpo = JSON.stringify(evento);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac('sha256', segredo).update(`${ts}.${corpo}`).digest('hex');
    return new Request('https://www.cnv0km.com.br/api/chatrun/eventos', {
        method: 'POST',
        body: corpo,
        headers: { 'x-chatrun-timestamp': ts, 'x-chatrun-signature': `sha256=${sig}`, 'x-chatrun-event': String(evento.type) },
    });
}

describe('canal da loja pelo Chatrun', () => {
    it('a conexão do gateway vira canal sem token, com o connection_id', async () => {
        const r = await upsertChatrunChannel(conexao(), lojaA);
        expect(r).toMatchObject({ ok: true, status: 'connected' });
        const doc = await WaChannel.findOne({ chatrunConnectionId: 'conn-1' });
        expect(doc).toMatchObject({ provider: 'chatrun', tenantId: lojaA, phoneNumberId: '1111', status: 'connected' });
        expect(doc!.token).toBeUndefined();
        const canal = resolveChannel(doc!);
        expect(canal.whatsapp?.chatrunConnectionId).toBe('conn-1');
    });

    it('o mesmo número não troca de loja', async () => {
        const r = await upsertChatrunChannel(conexao(), lojaB);
        expect(r).toEqual({ ok: false, reason: 'Este número já está conectado a outra loja.' });
    });

    it('external_ref que não é loja não cria canal', async () => {
        expect(await upsertChatrunChannel(conexao({ id: 'conn-x', phone_number_id: '9' }), 'nao-e-id')).toMatchObject({ ok: false });
        expect(await WaChannel.exists({ chatrunConnectionId: 'conn-x' })).toBeNull();
    });
});

describe('eventos do gateway', () => {
    const recebida = (wamid: string, texto: string) => ({
        id: `del-${wamid}`,
        type: 'message.received',
        connection: { ...conexao(), external_ref: lojaA },
        data: {
            message: {
                wamid,
                type: 'text',
                text: texto,
                contact_phone: '5531988887777',
                payload: { from: '5531988887777', id: wamid, timestamp: '1793700000', type: 'text', text: { body: texto } },
            },
            contact: { phone: '5531988887777', name: 'Cliente Teste' },
        },
    });

    it('recusa evento sem a assinatura certa', async () => {
        const res = await eventos(assinado(recebida('wamid.X', 'oi'), 'outro-segredo'));
        expect(res.status).toBe(401);
        expect(await WaMessage.exists({ externalId: 'wamid.X' })).toBeNull();
    });

    it('mensagem recebida entra na conversa da loja dona do número', async () => {
        const res = await eventos(assinado(recebida('wamid.A1', 'Tem o Nivus 2026?')));
        expect(res.status).toBe(200);
        const contato = await WaContact.findOne({ phone: '+5531988887777' }).lean();
        expect(contato?.tenantId).toBe(lojaA);
        const conversa = await WaConversation.findOne({ contactId: contato!._id }).lean();
        const canal = await WaChannel.findOne({ chatrunConnectionId: 'conn-1' });
        expect(String(conversa?.channelId)).toBe(String(canal!._id));
        const msg = await WaMessage.findOne({ externalId: 'wamid.A1' }).lean();
        expect(msg).toMatchObject({ direction: 'inbound', content: 'Tem o Nivus 2026?' });
    });

    it('reentrega do mesmo evento não duplica', async () => {
        await eventos(assinado(recebida('wamid.A1', 'Tem o Nivus 2026?')));
        expect(await WaMessage.countDocuments({ externalId: 'wamid.A1' })).toBe(1);
    });

    it('status da Meta chega pela mensagem', async () => {
        const conv = await WaConversation.findOne({}).lean();
        await WaMessage.create({ conversationId: conv!._id, direction: 'outbound', sender: 'ai', content: 'Temos sim!', externalId: 'wamid.OUT1', status: 'sent' } as any);
        const res = await eventos(assinado({
            id: 'del-st', type: 'message.status', connection: { ...conexao(), external_ref: lojaA },
            data: { wamid: 'wamid.OUT1', status: 'read', contact_phone: '5531988887777' },
        }));
        expect(res.status).toBe(200);
        expect((await WaMessage.findOne({ externalId: 'wamid.OUT1' }).lean())?.status).toBe('read');
    });

    it('desconexão no gateway desliga o canal', async () => {
        await eventos(assinado({ id: 'del-d', type: 'connection.disconnected', connection: { ...conexao(), status: 'disconnected', external_ref: lojaA }, data: { scope: 'platform' } }));
        expect((await WaChannel.findOne({ chatrunConnectionId: 'conn-1' }))?.status).toBe('disconnected');
        await eventos(assinado({ id: 'del-c', type: 'connection.connected', connection: { ...conexao(), external_ref: lojaA }, data: { connection: conexao(), is_new: false } }));
        expect((await WaChannel.findOne({ chatrunConnectionId: 'conn-1' }))?.status).toBe('connected');
    });
});

describe('envio e modelos pelo gateway', () => {
    const creds = { token: '', phoneNumberId: '1111', chatrunConnectionId: 'conn-1' };

    it('texto vai para /api/v1/messages com a conexão e devolve o wamid', async () => {
        resposta = () => ({ status: 201, body: { ok: true, message: { wamid: 'wamid.G1', status: 'accepted' } } });
        const r = await sendText(creds, '+55 (31) 98888-7777', 'Olá!', 'wamid.A1');
        expect(r.external_id).toBe('wamid.G1');
        expect(chamadas[0]).toMatchObject({
            url: 'https://gateway.teste/api/v1/messages',
            method: 'POST',
            body: { connection_id: 'conn-1', to: '5531988887777', type: 'text', text: 'Olá!', reply_to: 'wamid.A1' },
        });
    });

    it('template leva nome, idioma e variáveis', async () => {
        resposta = () => ({ status: 201, body: { message: { wamid: 'wamid.T1' } } });
        await sendTemplate(creds, '5531988887777', 'oferta_semana', 'pt_BR', ['Maria']);
        expect(chamadas[0].body).toMatchObject({ type: 'template', template: { name: 'oferta_semana', language: 'pt_BR', body_params: ['Maria'] } });
    });

    it('fora da janela de 24h vira o erro 131047 que o módulo já trata', async () => {
        resposta = () => ({ status: 422, body: { error: 'Contato fora da janela de 24h', code: 'outside_24h_window' } });
        await expect(sendText(creds, '5531988887777', 'oi')).rejects.toMatchObject({ code: 131047, status: 422 });
        await expect(sendText(creds, '5531988887777', 'oi')).rejects.toBeInstanceOf(MetaApiError);
    });

    it('modelos do gateway chegam no formato da Meta', async () => {
        resposta = () => ({ status: 200, body: { templates: [{
            id: 't1', name: 'oferta_semana', language: 'pt_BR', category: 'MARKETING', status: 'APPROVED',
            body: 'Oi {{1}}!', footer: 'Responda SAIR', header_format: 'TEXT', header_text: 'Ofertas',
            body_example: ['Maria'], buttons_detail: [{ type: 'QUICK_REPLY', text: 'SAIR' }],
        }] } });
        const [t] = await listTemplates(creds);
        expect(chamadas[0].url).toBe('https://gateway.teste/api/v1/templates?connection_id=conn-1&all=1');
        expect(t).toMatchObject({ name: 'oferta_semana', status: 'APPROVED' });
        expect(t.components).toEqual([
            { type: 'HEADER', format: 'TEXT', text: 'Ofertas' },
            { type: 'BODY', text: 'Oi {{1}}!', example: { body_text: [['Maria']] } },
            { type: 'FOOTER', text: 'Responda SAIR' },
            { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'SAIR', url: undefined, phone_number: undefined }] },
        ]);
    });

    it('criar modelo manda o rascunho no formato do gateway', async () => {
        resposta = () => ({ status: 201, body: { id: 'novo', status: 'PENDING', category: 'MARKETING' } });
        const r = await createTemplate(creds, {
            name: 'novidade', language: 'pt_BR', category: 'MARKETING', body: 'Oi {{1}}, chegou {{2}}.',
            bodyExamples: ['Ana', 'Nivus'], footerText: 'Responda SAIR',
            buttons: [{ type: 'URL', text: 'Ver carro', url: 'https://cnv0km.com.br/c/{{1}}' }],
        });
        expect(r).toEqual({ id: 'novo', status: 'PENDING', category: 'MARKETING' });
        expect(chamadas[0].body).toEqual({
            connection_id: 'conn-1', name: 'novidade', category: 'MARKETING', language: 'pt_BR',
            body_text: 'Oi {{1}}, chegou {{2}}.', example_values: ['Ana', 'Nivus'], footer_text: 'Responda SAIR',
            buttons: [{ type: 'URL', text: 'Ver carro', url: 'https://cnv0km.com.br/c/{{1}}', example: 'https://cnv0km.com.br/c/exemplo' }],
        });
    });
});

describe('webhook da Meta (números com credencial própria) continua igual', () => {
    it('mensagem pelo phone_number_id do canal manual entra na loja dele', async () => {
        await WaChannel.create({ kind: 'whatsapp', tenantId: lojaB, status: 'connected', phoneNumberId: '7777', token: 'tok' } as any);
        const corpo = JSON.stringify({ entry: [{ changes: [{ value: {
            metadata: { phone_number_id: '7777', display_phone_number: '553100000000' },
            contacts: [{ wa_id: '5531977776666', profile: { name: 'Outro Cliente' } }],
            messages: [{ from: '5531977776666', id: 'wamid.M1', timestamp: '1793700000', type: 'text', text: { body: 'Bom dia' } }],
        } }] }] });
        const res = await webhookMeta(new Request('https://www.cnv0km.com.br/api/webhooks/meta', { method: 'POST', body: corpo }) as any);
        expect(res.status).toBe(200);
        const contato = await WaContact.findOne({ phone: '+5531977776666' }).lean();
        expect(contato?.tenantId).toBe(lojaB);
        expect(await WaMessage.exists({ externalId: 'wamid.M1' })).toBeTruthy();
    });
});
