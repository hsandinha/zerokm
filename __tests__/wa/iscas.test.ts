// @vitest-environment node
// Iscas de comentário (Instagram e Página do Facebook pelo Chatrun Conexão):
// as regras puras do cadastro, o que vai ao gateway, o cliente do gateway
// (fetch falso), o comment_reply idempotente e isolado por loja, e a ordem
// das gravações (gateway primeiro). Coleções falsas em memória.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
const espioes = vi.hoisted(() => ({ eventos: [] as Array<{ tipo: string; data: any }> }));

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
vi.mock('@wa/lib/webhooks', () => ({
    emitEvent: async (tipo: string, data: any) => {
        espioes.eventos.push({ tipo, data });
    },
}));
vi.mock('@wa/models/isca', async () => {
    const { FakeComUpsert } = await import('./helpers/fake-upsert');
    fakes.iscas = new FakeComUpsert(['chatrunRuleId']);
    fakes.comentarios = new FakeComUpsert(['commentId']);
    return { WaIsca: fakes.iscas, WaIscaComentario: fakes.comentarios };
});
vi.mock('@wa/models/wa', async () => {
    const { FakeComUpsert } = await import('./helpers/fake-upsert');
    fakes.contatos = new FakeComUpsert([['tenantId', 'phone']]);
    fakes.conversas = new FakeComUpsert(['contactId']);
    fakes.mensagens = new FakeComUpsert(['externalId']);
    fakes.jobs = new FakeComUpsert();
    return {
        WaContact: fakes.contatos,
        WaConversation: fakes.conversas,
        WaMessage: fakes.mensagens,
        WaAiJob: fakes.jobs,
        WaSettings: new FakeComUpsert(),
    };
});
vi.mock('@wa/models/channel', async () => {
    const { FakeComUpsert } = await import('./helpers/fake-upsert');
    fakes.canais = new FakeComUpsert();
    return { WaChannel: fakes.canais, WA_CHANNEL_KINDS: ['whatsapp', 'instagram', 'messenger', 'sms'] };
});
const bloqueios = vi.hoisted(() => ({ chamadas: [] as Array<{ phone: string; tenantId: string | null; saiu: boolean }> }));
vi.mock('@wa/lib/chatrun-bloqueio', () => ({
    sincronizarOptOutNoGateway: async (c: { tenantId?: string | null; phone: string }, saiu: boolean) => {
        bloqueios.chamadas.push({ phone: c.phone, tenantId: c.tenantId ?? null, saiu });
    },
}));
vi.mock('@wa/lib/scope', () => ({
    podeUsar: (s: any, r: string) => !s.store || Boolean(s.store.recursos[r]),
    tenantFilter: (s: any) => ({ tenantId: s.tenantId }),
    sameTenant: (s: any, d: any) => Boolean(d) && (d.tenantId ?? null) === s.tenantId,
    requireScope: async () => {
        throw new Error('não usado aqui');
    },
    requireScopeAdmin: async () => {
        throw new Error('não usado aqui');
    },
    scopeError: () => ({ error: 'Não autorizado', status: 401 }),
}));

import {
    LIMITE_DIRECT,
    canalInicial,
    corpoDaRegra,
    iscaRepetida,
    lerIsca,
    normalizarPalavra,
    resumoDaLegenda,
} from '@wa/lib/iscas';
import {
    chaveDoContatoDaIsca,
    eventoDeIsca,
    idDaPrivada,
    linhaDaIsca,
    respostaDaIsca,
} from '@wa/lib/iscas-eventos';
import { apagarIsca, alterarIsca, criarIsca, IscaError } from '@wa/lib/iscas-servidor';
import {
    createCommentRule,
    deleteCommentRule,
    getCommentRule,
    listCommentRules,
    postsDaConexao,
    updateCommentRule,
} from '@wa/lib/chatrun';
import { entradaDoPerfil } from '@wa/lib/chatrun-perfil';
import { contactKeyFor, type ResolvedChannel } from '@wa/lib/channels';

// ── Gateway falso ─────────────────────────────────────────────
type Chamada = { url: string; method: string; body: any };
let chamadas: Chamada[] = [];
let resposta: (c: Chamada) => { status: number; body: unknown } = () => ({ status: 200, body: {} });
const fetchOriginal = globalThis.fetch;

beforeAll(() => {
    process.env.CHATRUN_API_KEY = 'crk_test_iscas';
    process.env.CHATRUN_URL = 'https://gateway.teste';
    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input);
        if (!url.startsWith('https://gateway.teste')) throw new Error(`fetch inesperado: ${url}`);
        const c: Chamada = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body) : null };
        chamadas.push(c);
        const r = resposta(c);
        return new Response(JSON.stringify(r.body), { status: r.status });
    }) as typeof fetch;
});

afterAll(() => {
    globalThis.fetch = fetchOriginal;
});

beforeEach(() => {
    chamadas = [];
    resposta = () => ({ status: 200, body: {} });
    espioes.eventos = [];
    for (const f of ['iscas', 'comentarios', 'contatos', 'conversas', 'mensagens', 'jobs', 'canais']) fakes[f].reset();
});

const oid = () => new mongoose.Types.ObjectId();

function recursos(extra: Record<string, boolean> = {}) {
    return { atendimento: true, instagram: true, messenger: true, ...extra };
}

function escopo(tenantId: string | null, r = recursos()) {
    return {
        tenantId,
        email: 'gestor@loja.com',
        name: 'Gestor',
        role: 'admin' as const,
        store: tenantId ? { id: tenantId, name: 'Loja', kind: 'lojista' as const, access: {} as any, recursos: r as any } : null,
    };
}

function canalDoc(p: { tenantId: string | null; kind?: 'instagram' | 'messenger'; conn?: string; provider?: string | null }) {
    const doc: Record<string, any> = {
        _id: oid(),
        kind: p.kind ?? 'instagram',
        tenantId: p.tenantId,
        status: 'connected',
        chatrunConnectionId: p.conn ?? `conn-${Math.random().toString(36).slice(2, 8)}`,
        igUsername: 'loja.oficial',
        createdAt: new Date(),
    };
    if (p.provider !== null) doc.provider = p.provider ?? 'chatrun';
    fakes.canais.docs.push(doc);
    return doc;
}

function resolvido(doc: Record<string, any>): ResolvedChannel {
    return {
        id: String(doc._id),
        kind: doc.kind,
        tenantId: doc.tenantId,
        label: 'canal',
        whatsapp: null,
        ig: null,
        fb: null,
        sms: null,
    };
}

function iscaDoc(p: { tenantId: string | null; canal: Record<string, any>; regra: string; mediaId?: string | null; keyword?: string | null }) {
    const doc = {
        _id: oid(),
        tenantId: p.tenantId,
        channelId: p.canal._id,
        canal: p.canal.kind,
        chatrunRuleId: p.regra,
        mediaId: p.mediaId ?? null,
        postLegenda: p.mediaId ? 'Onix 2025 completo, único dono' : null,
        keyword: p.keyword ?? null,
        publicReply: null,
        directMessage: 'Oi! Te mando as fotos e o valor agora.',
        ativo: true,
        priority: 0,
        comentarios: 0,
        directs: 0,
        falhas: 0,
        createdAt: new Date(),
    };
    fakes.iscas.docs.push(doc);
    return doc;
}

// ── Regras puras ──────────────────────────────────────────────
describe('cadastro da isca (regras puras)', () => {
    it('normaliza a palavra como o gateway: sem acento, sem caixa, sem espaço sobrando', () => {
        expect(normalizarPalavra('  Eu   Querô! ')).toBe('eu quero!');
        expect(normalizarPalavra(null)).toBe('');
    });

    it('criar exige o canal e a mensagem privada, e respeita os limites', () => {
        expect(lerIsca({ directMessage: 'oi' }, true)).toEqual({ ok: false, erro: 'Escolha o canal da isca.' });
        expect(lerIsca({ channelId: 'c1', directMessage: '   ' }, true).ok).toBe(false);
        expect(lerIsca({ channelId: 'c1', directMessage: 'x'.repeat(LIMITE_DIRECT + 1) }, true).ok).toBe(false);
        expect(lerIsca({ channelId: 'c1', directMessage: 'oi', keyword: 'k'.repeat(61) }, true).ok).toBe(false);
        expect(lerIsca({ channelId: 'c1', directMessage: 'oi', mediaId: '123 456' }, true).ok).toBe(false);
        expect(lerIsca({ channelId: 'c1', directMessage: 'oi', priority: 1.5 }, true).ok).toBe(false);
    });

    it('vazio vira null, o post só vale com post escolhido e foto só https', () => {
        const r = lerIsca(
            {
                channelId: ' c1 ',
                keyword: '  Eu    quero ',
                publicReply: '   ',
                directMessage: '  Oi!  ',
                mediaId: '',
                post: { legenda: 'Onix', imagem: 'https://cdn/1.jpg', link: 'https://instagram.com/p/1' },
            },
            true,
        );
        expect(r).toEqual({
            ok: true,
            channelId: 'c1',
            campos: {
                keyword: 'Eu quero',
                publicReply: null,
                directMessage: 'Oi!',
                mediaId: null,
                postLegenda: null,
                postImagem: null,
                postLink: null,
                ativo: true,
                priority: 0,
            },
        });
        const comPost = lerIsca(
            { channelId: 'c1', directMessage: 'oi', mediaId: '1789_22', post: { legenda: 'x', imagem: 'http://inseguro/1.jpg', link: 'javascript:alert(1)' } },
            true,
        );
        expect(comPost.ok && comPost.campos).toMatchObject({ mediaId: '1789_22', postLegenda: 'x', postImagem: null, postLink: null });
    });

    it('editar traz só o que veio, e a mensagem privada não pode ficar vazia', () => {
        expect(lerIsca({ ativo: false }, false)).toEqual({ ok: true, channelId: null, campos: { ativo: false } });
        expect(lerIsca({ directMessage: '' }, false).ok).toBe(false);
    });

    it('monta o corpo do gateway em snake_case, só com o que mudou (null apaga o post)', () => {
        const criar = lerIsca({ channelId: 'c1', keyword: 'EU QUERO', directMessage: 'Oi', publicReply: 'Te chamei!' }, true);
        expect(criar.ok && corpoDaRegra(criar.campos)).toEqual({
            media_id: null,
            keyword: 'EU QUERO',
            public_reply: 'Te chamei!',
            direct_message: 'Oi',
            active: true,
            priority: 0,
        });
        expect(corpoDaRegra({ ativo: false })).toEqual({ active: false });
        expect(corpoDaRegra({ mediaId: null })).toEqual({ media_id: null });
        // O que a tela guarda do post não vai ao gateway.
        expect(corpoDaRegra({ postLegenda: 'x', postImagem: 'https://a', mediaId: '9' })).toEqual({ media_id: '9' });
    });

    it('recusa a isca que nunca dispararia: outra ativa no mesmo canal, post e palavra', () => {
        const existentes = [
            { id: 'a', channelId: 'c1', mediaId: 'm1', keyword: 'Eu Querô', ativo: true },
            { id: 'b', channelId: 'c1', mediaId: null, keyword: null, ativo: false },
        ];
        expect(iscaRepetida(existentes, { channelId: 'c1', mediaId: 'm1', keyword: 'eu quero', ativo: true })?.id).toBe('a');
        expect(iscaRepetida(existentes, { channelId: 'c2', mediaId: 'm1', keyword: 'eu quero', ativo: true })).toBeNull();
        expect(iscaRepetida(existentes, { channelId: 'c1', mediaId: 'm2', keyword: 'eu quero', ativo: true })).toBeNull();
        expect(iscaRepetida(existentes, { channelId: 'c1', mediaId: null, keyword: null, ativo: true })).toBeNull();
        expect(iscaRepetida(existentes, { channelId: 'c1', mediaId: 'm1', keyword: 'eu quero', ativo: false })).toBeNull();
        expect(iscaRepetida(existentes, { id: 'a', channelId: 'c1', mediaId: 'm1', keyword: 'eu quero', ativo: true })).toBeNull();
    });

    it('o modal abre no primeiro canal conectado; a legenda corta com reticências', () => {
        const canais = [
            { id: '1', kind: 'instagram' as const, label: '@a', status: 'error' as const },
            { id: '2', kind: 'messenger' as const, label: 'Página', status: 'connected' as const },
        ];
        expect(canalInicial(canais)?.id).toBe('2');
        expect(canalInicial([])).toBeNull();
        expect(resumoDaLegenda('Onix   2025\ncompleto', 9)).toBe('Onix 202…');
    });
});

describe('contato de quem recebeu a privada', () => {
    it('é a mesma chave do Direct e do Messenger que chegam (entradaDoPerfil)', () => {
        const ig = { phone: 'ig:17841', ig_id: '17841', username: 'ana', name: '@ana' };
        const entradaIg = entradaDoPerfil('instagram', { wamid: 'm1', type: 'text', text: 'oi' }, ig)!;
        expect(chaveDoContatoDaIsca('instagram', ig)).toBe('ig:17841');
        expect(chaveDoContatoDaIsca('instagram', ig)).toBe(contactKeyFor('instagram', entradaIg.from));

        const fb = { phone: 'fb:55500', fb_id: '55500', name: 'João' };
        const entradaFb = entradaDoPerfil('messenger', { wamid: 'm2', type: 'text', text: 'oi' }, fb)!;
        expect(chaveDoContatoDaIsca('messenger', fb)).toBe(contactKeyFor('messenger', entradaFb.from));

        // Só o telefone do evento também serve; sem PSID não há contato.
        expect(chaveDoContatoDaIsca('instagram', { phone: 'ig:999' })).toBe('ig:999');
        expect(chaveDoContatoDaIsca('messenger', { phone: null, fb_id: null, name: 'João' })).toBeNull();
    });

    it('id da privada: o da Meta, ou o mesmo de reserva do gateway', () => {
        expect(idDaPrivada('instagram', 'c1', 'mid.1')).toBe('mid.1');
        expect(idDaPrivada('instagram', 'c1', null)).toBe('ig-isca-c1');
        expect(idDaPrivada('messenger', 'c1')).toBe('fb-isca-c1');
    });

    it('a linha do tempo diz de onde veio, sem travessão', () => {
        const l = linhaDaIsca({ kind: 'instagram', comentario: 'EU QUERO', legenda: 'Onix 2025', mediaId: 'm1' });
        expect(l).toBe('Veio da isca de comentário: comentou "EU QUERO" no post "Onix 2025" e recebeu a mensagem no Direct.');
        expect(linhaDaIsca({ kind: 'messenger', comentario: '' })).toContain('num post da Página');
        expect(l).not.toContain('—');
    });
});

// ── Cliente do gateway ────────────────────────────────────────
describe('cliente do gateway: /api/v1/comment-rules e posts', () => {
    it('CRUD das regras com o método, a rota e o corpo certos', async () => {
        resposta = (c) =>
            c.method === 'POST'
                ? { status: 201, body: { rule: { id: 'r1', direct_message: c.body.direct_message } } }
                : c.method === 'GET' && c.url.includes('/r1')
                  ? { status: 200, body: { rule: { id: 'r1' }, stats: { comments: 3, directs: 2, failures: 1 } } }
                  : c.method === 'GET'
                    ? { status: 200, body: { rules: [{ id: 'r1' }] } }
                    : { status: 200, body: { rule: { id: 'r1', active: false }, ok: true } };

        const criada = await createCommentRule({ connection_id: 'conn', direct_message: 'Oi', external_ref: 'x1', keyword: null });
        expect(criada).toEqual({ rule: { id: 'r1', direct_message: 'Oi' }, warnings: [] });
        expect(chamadas[0]).toMatchObject({
            url: 'https://gateway.teste/api/v1/comment-rules',
            method: 'POST',
            body: { connection_id: 'conn', direct_message: 'Oi', external_ref: 'x1', keyword: null },
        });

        expect(await listCommentRules({ connectionId: 'conn', active: true })).toEqual([{ id: 'r1' }]);
        expect(chamadas[1].url).toBe('https://gateway.teste/api/v1/comment-rules?connection_id=conn&active=true');

        expect((await getCommentRule('r1')).stats).toEqual({ comments: 3, directs: 2, failures: 1 });

        expect(await updateCommentRule('r1', { active: false })).toEqual({ id: 'r1', active: false });
        expect(chamadas[3]).toMatchObject({ url: 'https://gateway.teste/api/v1/comment-rules/r1', method: 'PATCH', body: { active: false } });

        await deleteCommentRule('r1');
        expect(chamadas[4]).toMatchObject({ url: 'https://gateway.teste/api/v1/comment-rules/r1', method: 'DELETE' });
    });

    it('posts: a lista vem normalizada; 404 (rota não publicada) ou falha devolvem null', async () => {
        resposta = () => ({
            status: 200,
            body: {
                posts: [
                    { id: 'p1', caption: 'Onix', type: 'reel', image_url: 'https://cdn/p1.jpg', permalink: 'https://ig/p1', created_at: '2026-11-01T10:00:00Z' },
                    { id: 'p2', caption: null, type: 'text', image_url: null, permalink: null, created_at: null },
                    { caption: 'sem id' },
                ],
            },
        });
        const posts = await postsDaConexao('conn 1', 500);
        expect(chamadas[0].url).toBe('https://gateway.teste/api/v1/connections/conn%201/posts?limit=50');
        expect(posts?.map((p) => p.id)).toEqual(['p1', 'p2']);
        expect(posts?.[0]).toEqual({ id: 'p1', caption: 'Onix', type: 'reel', image_url: 'https://cdn/p1.jpg', permalink: 'https://ig/p1', created_at: '2026-11-01T10:00:00Z' });

        resposta = () => ({ status: 404, body: { error: 'not found' } });
        expect(await postsDaConexao('conn')).toBeNull();
        resposta = () => ({ status: 502, body: { error: 'meta_error' } });
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(await postsDaConexao('conn')).toBeNull();
        aviso.mockRestore();
        resposta = () => ({ status: 200, body: { nada: true } });
        expect(await postsDaConexao('conn')).toBeNull();
    });
});

// ── Eventos: comment e comment_reply ──────────────────────────
describe('comment_reply: idempotente, isolado por loja e sem acordar a IA', () => {
    function reply(p: { canal: 'instagram' | 'messenger'; commentId: string; isca?: Record<string, any> | null; regra?: string; ref?: string | null; extra?: Record<string, any> }) {
        const ig = p.canal === 'instagram';
        return {
            comment: { id: p.commentId, text: 'EU QUERO', media_id: 'm1', from: ig ? { id: 'u1', username: 'ana' } : { id: 'f1', name: 'João' } },
            rule: { id: p.regra ?? p.isca?.chatrunRuleId ?? 'r?', external_ref: p.ref !== undefined ? p.ref : p.isca ? String(p.isca._id) : null, media_id: 'm1', keyword: 'eu quero' },
            replied_public: true,
            replied_direct: true,
            direct_message_id: `mid-${p.commentId}`,
            contact: ig ? { phone: 'ig:igsid-9', ig_id: 'igsid-9', username: 'ana', name: '@ana' } : { phone: 'fb:psid-7', fb_id: 'psid-7', name: 'João' },
            error: null,
            ...(p.extra ?? {}),
        };
    }

    it('a primeira entrega conta, abre a conversa e grava a privada; a reentrega não soma nada', async () => {
        const canal = canalDoc({ tenantId: 'lojaA', conn: 'conn-a' });
        const isca = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-1', mediaId: 'm1', keyword: 'eu quero' });
        const dados = reply({ canal: 'instagram', commentId: 'c-1', isca });

        const r1 = await respostaDaIsca(resolvido(canal), dados);
        expect(r1).toMatchObject({ contou: true, iscaId: String(isca._id) });
        expect(fakes.iscas.byId(isca._id)).toMatchObject({ comentarios: 1, directs: 1, falhas: 0 });

        // Contato com a chave do Direct, na loja do canal.
        expect(fakes.contatos.docs).toHaveLength(1);
        expect(fakes.contatos.docs[0]).toMatchObject({ tenantId: 'lojaA', phone: 'ig:igsid-9', source: 'instagram', igUserId: 'igsid-9', igUsername: 'ana', name: '@ana' });
        // Conversa nova em "abordado", sem não lida, sem janela aberta e sem IA na fila.
        const conversa = fakes.conversas.docs[0];
        expect(fakes.conversas.docs).toHaveLength(1);
        expect(conversa).toMatchObject({ tenantId: 'lojaA', stage: 'abordado', status: 'ai_active', lastMessagePreview: isca.directMessage });
        expect(String(conversa.channelId)).toBe(String(canal._id));
        expect(conversa.unreadCount ?? 0).toBe(0);
        expect(conversa.lastInboundAt).toBeUndefined();
        expect(fakes.jobs.docs).toHaveLength(0);
        expect(r1?.conversationId).toBe(String(conversa._id));

        // A privada (id da Meta, autor sistema) e a linha do tempo com o post.
        const privada = fakes.mensagens.docs.find((m: any) => m.externalId === 'mid-c-1');
        expect(privada).toMatchObject({ direction: 'outbound', sender: 'system', content: isca.directMessage, mediaType: 'text' });
        const linha = fakes.mensagens.docs.find((m: any) => m.mediaType === 'evento');
        expect(linha.content).toContain('Onix 2025');
        expect(linha.createdAt.getTime()).toBeLessThan(privada.createdAt.getTime());
        expect(espioes.eventos.map((e) => e.tipo)).toEqual(['conversa.criada']);

        // O comentário guarda o resultado e a conversa.
        expect(fakes.comentarios.docs).toHaveLength(1);
        expect(fakes.comentarios.docs[0]).toMatchObject({
            commentId: 'c-1',
            tenantId: 'lojaA',
            respondeuPublico: true,
            respondeuDirect: true,
            directMessageId: 'mid-c-1',
            contato: 'ig:igsid-9',
        });
        expect(String(fakes.comentarios.docs[0].iscaId)).toBe(String(isca._id));

        // Reentrega do mesmo evento: nada soma, nada duplica.
        const r2 = await respostaDaIsca(resolvido(canal), dados);
        expect(r2).toMatchObject({ contou: false, conversationId: String(conversa._id) });
        expect(fakes.iscas.byId(isca._id)).toMatchObject({ comentarios: 1, directs: 1, falhas: 0 });
        expect(fakes.mensagens.docs).toHaveLength(2);
        expect(fakes.conversas.docs).toHaveLength(1);
        expect(fakes.comentarios.docs).toHaveLength(1);
        expect(espioes.eventos).toHaveLength(1);

        // O aviso do comentário chega depois (cron do gateway): não apaga o resultado.
        await eventoDeIsca(resolvido(canal), 'instagram.comment', { comment: dados.comment });
        expect(fakes.comentarios.docs).toHaveLength(1);
        expect(fakes.comentarios.docs[0].respondeuDirect).toBe(true);

        // Quando a pessoa responder o Direct, cai neste mesmo contato.
        const entrada = entradaDoPerfil('instagram', { wamid: 'resp-1', type: 'text', text: 'quero sim' }, dados.contact)!;
        expect(contactKeyFor('instagram', entrada.from)).toBe(fakes.contatos.docs[0].phone);
    });

    it('comentário antes do resultado: uma linha só, e conta uma vez', async () => {
        const canal = canalDoc({ tenantId: 'lojaA' });
        const isca = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-2' });
        const dados = reply({ canal: 'instagram', commentId: 'c-2', isca });

        await eventoDeIsca(resolvido(canal), 'instagram.comment', { comment: dados.comment });
        expect(fakes.comentarios.docs[0]).toMatchObject({ commentId: 'c-2', autorUsername: 'ana', texto: 'EU QUERO', iscaId: null, respostaEm: null });
        await eventoDeIsca(resolvido(canal), 'instagram.comment_reply', dados);
        await eventoDeIsca(resolvido(canal), 'instagram.comment_reply', dados);
        expect(fakes.comentarios.docs).toHaveLength(1);
        expect(fakes.iscas.byId(isca._id)).toMatchObject({ comentarios: 1, directs: 1 });
    });

    it('a isca é procurada dentro da loja do canal: external_ref de outra loja não conta', async () => {
        const canalA = canalDoc({ tenantId: 'lojaA' });
        const canalB = canalDoc({ tenantId: 'lojaB' });
        const iscaA = iscaDoc({ tenantId: 'lojaA', canal: canalA, regra: 'rule-a' });

        const r = await respostaDaIsca(resolvido(canalB), reply({ canal: 'instagram', commentId: 'c-3', isca: iscaA }));
        expect(r).toMatchObject({ contou: true, iscaId: null });
        expect(fakes.iscas.byId(iscaA._id)).toMatchObject({ comentarios: 0, directs: 0, falhas: 0 });
        // A privada saiu pelo canal da loja B: a conversa é da loja B.
        expect(fakes.contatos.docs[0].tenantId).toBe('lojaB');
        expect(fakes.comentarios.docs[0].tenantId).toBe('lojaB');
    });

    it('o id da regra também tem de bater (o external_ref sozinho não basta)', async () => {
        const canal = canalDoc({ tenantId: 'lojaA' });
        const isca = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-certa' });
        const r = await respostaDaIsca(resolvido(canal), reply({ canal: 'instagram', commentId: 'c-4', isca, regra: 'rule-outra' }));
        expect(r?.iscaId).toBeNull();
        expect(fakes.iscas.byId(isca._id).comentarios).toBe(0);
    });

    it('Messenger que falhou: conta a falha, sem contato nem conversa (sem PSID)', async () => {
        const canal = canalDoc({ tenantId: 'lojaA', kind: 'messenger' });
        const isca = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-fb' });
        const dados = reply({
            canal: 'messenger',
            commentId: 'c-5',
            isca,
            extra: {
                replied_public: false,
                replied_direct: false,
                direct_message_id: null,
                contact: { phone: null, fb_id: null, name: 'João' },
                error: 'messenger: (#10900) já respondido',
            },
        });
        await eventoDeIsca(resolvido(canal), 'messenger.comment_reply', dados);
        expect(fakes.iscas.byId(isca._id)).toMatchObject({ comentarios: 1, directs: 0, falhas: 1 });
        expect(fakes.contatos.docs).toHaveLength(0);
        expect(fakes.conversas.docs).toHaveLength(0);
        expect(fakes.comentarios.docs[0]).toMatchObject({ autorNome: 'João', erro: 'messenger: (#10900) já respondido', respondeuDirect: false, conversationId: null });
    });

    it('barrada pelo bloqueio (pediu para sair) não conta como falha; bloqueio sem opt-out aqui é desfeito', async () => {
        bloqueios.chamadas.length = 0;
        const canal = canalDoc({ tenantId: 'lojaA' });
        const isca = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-blq' });
        const dados = reply({
            canal: 'instagram',
            commentId: 'c-blq',
            isca,
            extra: {
                replied_public: false,
                replied_direct: false,
                direct_message_id: null,
                contact: { phone: 'ig:u1', ig_id: 'u1', username: 'ana', name: '@ana' },
                error: 'contato bloqueado (pediu para sair): isca não enviada',
            },
        });
        await respostaDaIsca(resolvido(canal), dados);
        expect(fakes.iscas.byId(isca._id)).toMatchObject({ comentarios: 1, directs: 0, falhas: 0 });
        expect(fakes.conversas.docs).toHaveLength(0);
        // Aqui o contato não saiu (nem existe): o gateway estava desencontrado.
        expect(bloqueios.chamadas).toEqual([{ phone: 'ig:u1', tenantId: 'lojaA', saiu: false }]);
        // Reentrega não chama de novo.
        await respostaDaIsca(resolvido(canal), dados);
        expect(bloqueios.chamadas).toHaveLength(1);
    });

    it('privada que saiu para quem pediu para sair: o bloqueio volta para o gateway', async () => {
        bloqueios.chamadas.length = 0;
        const canal = canalDoc({ tenantId: 'lojaA' });
        const isca = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-opt' });
        await fakes.contatos.create({ tenantId: 'lojaA', phone: 'ig:igsid-9', optOut: true });
        await respostaDaIsca(resolvido(canal), reply({ canal: 'instagram', commentId: 'c-opt', isca }));
        expect(bloqueios.chamadas).toEqual([{ phone: 'ig:igsid-9', tenantId: 'lojaA', saiu: true }]);
    });

    it('Messenger que deu certo: contato fb:<PSID> e a privada com o id de reserva quando a Meta não dá um', async () => {
        const canal = canalDoc({ tenantId: null, kind: 'messenger' });
        const isca = iscaDoc({ tenantId: null, canal, regra: 'rule-cnv' });
        await respostaDaIsca(resolvido(canal), reply({ canal: 'messenger', commentId: 'c-6', isca, extra: { direct_message_id: null } }));
        expect(fakes.contatos.docs[0]).toMatchObject({ tenantId: null, phone: 'fb:psid-7', fbPsid: 'psid-7', source: 'messenger', name: 'João' });
        expect(fakes.mensagens.docs.some((m: any) => m.externalId === 'fb-isca-c-6')).toBe(true);
        expect(fakes.iscas.byId(isca._id).directs).toBe(1);
    });

    it('evento de outro canal (messenger.* numa conta do Instagram) é ignorado', async () => {
        const canal = canalDoc({ tenantId: 'lojaA' });
        await eventoDeIsca(resolvido(canal), 'messenger.comment', { comment: { id: 'c-7', text: 'oi' } });
        await eventoDeIsca({ ...resolvido(canal), kind: 'whatsapp' }, 'instagram.comment', { comment: { id: 'c-8' } });
        expect(fakes.comentarios.docs).toHaveLength(0);
    });

    it('conversa que já existia recebe a privada sem virar outra conversa', async () => {
        const canal = canalDoc({ tenantId: 'lojaA' });
        const isca = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-8' });
        const contato = { _id: oid(), tenantId: 'lojaA', phone: 'ig:igsid-9', name: 'Ana Souza' };
        fakes.contatos.docs.push(contato);
        const conversa = { _id: oid(), contactId: contato._id, tenantId: 'lojaA', status: 'closed', stage: 'conversa', unreadCount: 2 };
        fakes.conversas.docs.push(conversa);

        await respostaDaIsca(resolvido(canal), reply({ canal: 'instagram', commentId: 'c-9', isca }));
        expect(fakes.conversas.docs).toHaveLength(1);
        expect(fakes.conversas.docs[0]).toMatchObject({ status: 'closed', stage: 'conversa', unreadCount: 2 });
        // O nome que a equipe já tinha não é trocado pelo @.
        expect(fakes.contatos.docs[0].name).toBe('Ana Souza');
        expect(espioes.eventos).toHaveLength(0);
    });
});

// ── Cadastro: gateway primeiro, depois o local ────────────────
describe('cadastro: gateway primeiro, depois o espelho local', () => {
    it('cria no gateway com o _id local como external_ref e grava o espelho', async () => {
        const canal = canalDoc({ tenantId: 'lojaA', conn: 'conn-a' });
        resposta = (c) => ({ status: 201, body: { rule: { id: 'rule-nova', ...c.body }, warnings: [] } });

        const r = await criarIsca(escopo('lojaA'), { channelId: String(canal._id), keyword: 'EU QUERO', directMessage: 'Oi!' }, 'gestor@loja.com');
        expect(chamadas).toHaveLength(1);
        expect(chamadas[0].body).toMatchObject({ connection_id: 'conn-a', keyword: 'EU QUERO', direct_message: 'Oi!', active: true, media_id: null });
        expect(chamadas[0].body.external_ref).toBe(r.isca.id);
        expect(fakes.iscas.docs[0]).toMatchObject({ tenantId: 'lojaA', chatrunRuleId: 'rule-nova', canal: 'instagram', createdBy: 'gestor@loja.com' });
        expect(r.isca).toMatchObject({ keyword: 'EU QUERO', directMessage: 'Oi!', ativo: true, comentarios: 0 });
    });

    it('gateway recusou: nada fica aqui', async () => {
        const canal = canalDoc({ tenantId: 'lojaA' });
        resposta = () => ({ status: 422, body: { error: 'iscas de comentário são só para conexões de Instagram ou Messenger' } });
        await expect(criarIsca(escopo('lojaA'), { channelId: String(canal._id), directMessage: 'Oi' }, null)).rejects.toMatchObject({ status: 422 });
        expect(fakes.iscas.docs).toHaveLength(0);
    });

    it('canal de outra loja, fora do gateway ou com o recurso desligado: recusa sem chamar o gateway', async () => {
        const daOutra = canalDoc({ tenantId: 'lojaB' });
        const semGateway = canalDoc({ tenantId: 'lojaA', provider: null });
        const messenger = canalDoc({ tenantId: 'lojaA', kind: 'messenger' });
        await expect(criarIsca(escopo('lojaA'), { channelId: String(daOutra._id), directMessage: 'Oi' }, null)).rejects.toMatchObject({ status: 404 });
        await expect(criarIsca(escopo('lojaA'), { channelId: String(semGateway._id), directMessage: 'Oi' }, null)).rejects.toMatchObject({ status: 422 });
        await expect(
            criarIsca(escopo('lojaA', recursos({ messenger: false })), { channelId: String(messenger._id), directMessage: 'Oi' }, null),
        ).rejects.toMatchObject({ status: 403 });
        await expect(criarIsca(escopo('lojaA'), { channelId: 'nao-e-id', directMessage: 'Oi' }, null)).rejects.toBeInstanceOf(IscaError);
        expect(chamadas).toHaveLength(0);
    });

    it('isca repetida (mesmo post e palavra) é recusada antes do gateway', async () => {
        const canal = canalDoc({ tenantId: 'lojaA' });
        iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-x', keyword: 'Eu Quero' });
        await expect(criarIsca(escopo('lojaA'), { channelId: String(canal._id), keyword: 'eu querô', directMessage: 'Oi' }, null)).rejects.toMatchObject({ status: 409 });
        expect(chamadas).toHaveLength(0);
    });

    it('alterar manda ao gateway só o que mudou e grava aqui', async () => {
        const canal = canalDoc({ tenantId: 'lojaA' });
        const isca = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-e' });
        resposta = (c) => ({ status: 200, body: { rule: { id: 'rule-e', ...c.body } } });
        const v = await alterarIsca(escopo('lojaA'), String(isca._id), { ativo: false });
        expect(chamadas[0]).toMatchObject({ method: 'PATCH', url: 'https://gateway.teste/api/v1/comment-rules/rule-e', body: { active: false } });
        expect(v.ativo).toBe(false);
        expect(fakes.iscas.byId(isca._id).ativo).toBe(false);
        // Isca de outra loja: não acha.
        await expect(alterarIsca(escopo('lojaB'), String(isca._id), { ativo: true })).rejects.toMatchObject({ status: 404 });
    });

    it('apagar: gateway 404 apaga o local mesmo assim; gateway fora do ar mantém', async () => {
        const canal = canalDoc({ tenantId: 'lojaA' });
        const a = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-404' });
        const b = iscaDoc({ tenantId: 'lojaA', canal, regra: 'rule-500' });
        resposta = (c) => (c.url.endsWith('rule-404') ? { status: 404, body: { error: 'isca não encontrada' } } : { status: 500, body: { error: 'falhou' } });
        await apagarIsca(escopo('lojaA'), String(a._id));
        expect(fakes.iscas.byId(a._id)).toBeUndefined();
        const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(apagarIsca(escopo('lojaA'), String(b._id))).rejects.toMatchObject({ status: 502 });
        erro.mockRestore();
        expect(fakes.iscas.byId(b._id)).toBeDefined();
        // De outra loja: 404 e o gateway nem é chamado.
        const antes = chamadas.length;
        await expect(apagarIsca(escopo('lojaB'), String(b._id))).rejects.toMatchObject({ status: 404 });
        expect(chamadas.length).toBe(antes);
    });
});
