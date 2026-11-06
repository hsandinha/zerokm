// @vitest-environment node
// API de Conversões da Meta para mensagens: as regras puras (evento da
// coluna, quando manda, o user_data de cada canal, o corpo, o prazo e as
// tentativas, wa/lib/conversoes-meta.ts) e a fila no servidor
// (wa/lib/conversoes-meta-servidor.ts) com coleções falsas: um evento por
// conversa, o envio depois da resposta, a reserva atômica e o reenvio.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({ depois: [] as Array<() => unknown> }) as Record<string, any>);

vi.mock('@/lib/mongodb', () => ({ default: async () => null }));
// O envio sai depois da resposta: o teste guarda e roda quando quer.
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void fakes.depois.push(fn) }));
vi.mock('@wa/lib/crypto', () => ({ encrypt: (s: string) => `enc:${s}`, decrypt: (s: string) => s.replace(/^enc:/, '') }));
vi.mock('@wa/lib/channels', () => ({ safeDecrypt: (s?: string | null) => (s ? s.replace(/^enc:/, '') : undefined) }));
vi.mock('@wa/lib/chatrun', () => ({
    chatrunConfigured: () => true,
    getConnection: async () => ({ waba_id: fakes.wabaDoGateway ?? null }),
}));
vi.mock('@wa/lib/meta', () => ({ GRAPH_VERSION: 'v21.0' }));

async function fakeModel() {
    const { FakeModel } = await import('./helpers/fake-model');
    // O que o servidor usa e o fake não tem: findById e o .lean() depois do
    // findOneAndUpdate.
    class Colecao extends FakeModel {
        findById(id: unknown) {
            return this.findOne({ _id: id });
        }
        findOneAndUpdate(f: any, u: any, o?: any): any {
            const p: any = super.findOneAndUpdate(f, u, o);
            p.lean = () => p;
            return p;
        }
    }
    return Colecao;
}

vi.mock('@wa/models/wa', async () => {
    const Colecao = await fakeModel();
    fakes.conversas = new Colecao();
    fakes.contatos = new Colecao();
    fakes.settings = new Colecao();
    return { WaConversation: fakes.conversas, WaContact: fakes.contatos, WaSettings: fakes.settings };
});
vi.mock('@wa/models/channel', async () => {
    const Colecao = await fakeModel();
    fakes.canais = new Colecao();
    return { WaChannel: fakes.canais };
});
vi.mock('@wa/models/funil', async () => {
    const Colecao = await fakeModel();
    fakes.colunas = new Colecao();
    return { WaFunilColuna: fakes.colunas };
});
vi.mock('@wa/models/agenda', async () => {
    const Colecao = await fakeModel();
    fakes.agenda = new Colecao();
    return { WaAgendamento: fakes.agenda };
});
vi.mock('@wa/models/carro-conversa', async () => {
    const Colecao = await fakeModel();
    fakes.carros = new Colecao();
    return { WaCarroDaConversa: fakes.carros };
});
vi.mock('@/models/RepasseVehicle', async () => {
    const Colecao = await fakeModel();
    fakes.veiculos = new Colecao();
    return { default: fakes.veiculos };
});
vi.mock('@wa/models/conversoes-meta', async () => {
    const Colecao = await fakeModel();
    // O índice único {tenantId, conversationId, evento} da coleção de verdade.
    class Eventos extends Colecao {
        async create(doc: any) {
            const igual = this.docs.some(
                (d) =>
                    (d.tenantId ?? null) === (doc.tenantId ?? null) &&
                    String(d.conversationId) === String(doc.conversationId) &&
                    d.evento === doc.evento,
            );
            if (igual) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
            return super.create(doc);
        }
    }
    fakes.config = new Colecao();
    fakes.eventos = new Eventos();
    return { WaConversoesMeta: fakes.config, WaEventoMeta: fakes.eventos };
});

import {
    EVENTOS_META,
    MAX_TENTATIVAS,
    dentroDoPrazo,
    erroDefinitivo,
    eventoDaColuna,
    eventoValido,
    montarPayloadMeta,
    montarUserData,
    motivoSemEnvio,
    normalizarConfig,
    numeroDeReais,
    proximaTentativa,
} from '@wa/lib/conversoes-meta';
import { colunasPadrao } from '@wa/lib/stages';
import {
    enviarEventoMeta,
    eventosRecentes,
    reenviarEventosMeta,
    registrarEventoDaColuna,
    testarConexao,
    valorDaVenda,
} from '@wa/lib/conversoes-meta-servidor';

const MIN = 60_000;
const DIA = 24 * 60 * MIN;
const AGORA = Date.parse('2026-11-06T15:00:00Z');

// ── Regras puras ─────────────────────────────────────────────

describe('evento da coluna', () => {
    it('vale o gravado; null é nenhum', () => {
        expect(eventoDaColuna({ eventoMeta: 'QualifiedLead', type: 'open' })).toBe('QualifiedLead');
        expect(eventoDaColuna({ eventoMeta: null, type: 'won' })).toBeNull();
    });

    it('coluna antiga (sem o campo): venda fechada manda Purchase, as outras nada', () => {
        expect(eventoDaColuna({ type: 'won' })).toBe('Purchase');
        expect(eventoDaColuna({ type: 'open' })).toBeNull();
        expect(eventoDaColuna({ type: 'lost' })).toBeNull();
        expect(eventoDaColuna(null)).toBeNull();
    });

    it('nome que a Meta não aceita não vira evento', () => {
        expect(eventoDaColuna({ eventoMeta: 'Venda' as any, type: 'won' })).toBeNull();
        expect(eventoValido('Purchase')).toBe(true);
        expect(eventoValido('purchase')).toBe(false);
        expect(EVENTOS_META).toHaveLength(14);
    });

    it('colunas de fábrica: Vendido manda Purchase e a visita é o lead qualificado', () => {
        for (const store of [true, false]) {
            const por = Object.fromEntries(colunasPadrao(store).map((c) => [c.systemKey, c.eventoMeta]));
            expect(por).toEqual({
                abordado: null,
                conversa: null,
                cadastro: 'QualifiedLead',
                pagamento: null,
                ganho: 'Purchase',
                perdido: null,
            });
        }
    });
});

describe('quando manda', () => {
    const config = { ativo: true, datasetId: '123456789', token: 'enc:x' };

    it('sem configuração ativa e completa, não manda', () => {
        const origem = { canal: 'whatsapp' as const, ctwaClid: 'ARAkLk' };
        expect(motivoSemEnvio({ config: null, origem })).toBe('sem configuração');
        expect(motivoSemEnvio({ config: { ...config, ativo: false }, origem })).toBe('sem configuração');
        expect(motivoSemEnvio({ config: { ...config, token: null }, origem })).toBe('sem configuração');
    });

    it('WhatsApp só com o clique do anúncio', () => {
        expect(motivoSemEnvio({ config, origem: { canal: 'whatsapp', ctwaClid: 'ARAkLk' } })).toBeNull();
        expect(motivoSemEnvio({ config, origem: { canal: 'whatsapp', ctwaClid: null } })).toBe('sem clique do anúncio');
        expect(motivoSemEnvio({ config, origem: { canal: 'whatsapp', ctwaClid: '  ' } })).toBe('sem clique do anúncio');
    });

    it('sem origem não veio de anúncio; Messenger e Direct com origem valem', () => {
        expect(motivoSemEnvio({ config, origem: null })).toBe('não veio de anúncio');
        expect(motivoSemEnvio({ config, origem: { canal: 'messenger', idOrigem: '120' } })).toBeNull();
        expect(motivoSemEnvio({ config, origem: { canal: 'instagram', idOrigem: '120' } })).toBeNull();
    });
});

describe('user_data por canal', () => {
    it('WhatsApp: a conta (WABA) e o ctwa_clid', () => {
        expect(
            montarUserData({ origem: { canal: 'whatsapp', ctwaClid: 'ARAkLk' }, contato: { phone: '+5531999998888' }, ids: { wabaId: '1029' } }),
        ).toEqual({ ok: true, userData: { whatsapp_business_account_id: '1029', ctwa_clid: 'ARAkLk' } });
        expect(montarUserData({ origem: { canal: 'whatsapp', ctwaClid: 'ARAkLk' }, contato: {}, ids: {} })).toEqual({
            ok: false,
            motivo: 'sem o id da conta do WhatsApp (WABA)',
        });
    });

    it('Messenger: a Página e o PSID (o que vem depois de "fb:")', () => {
        expect(montarUserData({ origem: { canal: 'messenger' }, contato: { phone: 'fb:7788' }, ids: { pageId: '55' } })).toEqual({
            ok: true,
            userData: { page_id: '55', page_scoped_user_id: '7788' },
        });
        expect(montarUserData({ origem: { canal: 'messenger' }, contato: { phone: 'fb:7788' }, ids: {} })).toMatchObject({ ok: false });
        expect(montarUserData({ origem: { canal: 'messenger' }, contato: { phone: '+5531' }, ids: { pageId: '55' } })).toEqual({
            ok: false,
            motivo: 'sem o id da pessoa no Messenger',
        });
    });

    it('Instagram: a conta profissional e o IGSID (o que vem depois de "ig:")', () => {
        expect(montarUserData({ origem: { canal: 'instagram' }, contato: { phone: 'ig:9911' }, ids: { igAccountId: '1784' } })).toEqual({
            ok: true,
            userData: { instagram_business_account_id: '1784', ig_sid: '9911' },
        });
        expect(montarUserData({ origem: { canal: 'instagram' }, contato: { phone: 'ig:9911' }, ids: {} })).toEqual({
            ok: false,
            motivo: 'sem o id da conta do Instagram',
        });
    });
});

describe('corpo do envio', () => {
    const userData = { whatsapp_business_account_id: '1029', ctwa_clid: 'ARAkLk' };
    const quando = new Date(AGORA);

    it('a venda vai com moeda e valor em reais; o horário em segundos', () => {
        expect(montarPayloadMeta({ evento: 'Purchase', quando, canal: 'whatsapp', userData, valor: 89900.555 })).toEqual({
            data: [
                {
                    event_name: 'Purchase',
                    event_time: Math.floor(AGORA / 1000),
                    action_source: 'business_messaging',
                    messaging_channel: 'whatsapp',
                    user_data: userData,
                    custom_data: { currency: 'BRL', value: 89900.56 },
                },
            ],
        });
    });

    it('venda sem valor vai com 0; os outros eventos sem custom_data', () => {
        expect(montarPayloadMeta({ evento: 'Purchase', quando, canal: 'whatsapp', userData }).data[0].custom_data).toEqual({ currency: 'BRL', value: 0 });
        expect(montarPayloadMeta({ evento: 'QualifiedLead', quando, canal: 'whatsapp', userData, valor: 10 }).data[0].custom_data).toBeUndefined();
    });

    it('o id do registro vai como event_id (o mesmo evento repetido leva o mesmo id)', () => {
        expect(montarPayloadMeta({ evento: 'Purchase', quando, canal: 'whatsapp', userData, eventId: 'ev-1' }).data[0].event_id).toBe('ev-1');
        expect(montarPayloadMeta({ evento: 'Purchase', quando, canal: 'whatsapp', userData }).data[0]).not.toHaveProperty('event_id');
    });

    it('o código de teste só entra quando é dado', () => {
        expect(montarPayloadMeta({ evento: 'Purchase', quando, canal: 'whatsapp', userData }).test_event_code).toBeUndefined();
        expect(montarPayloadMeta({ evento: 'Purchase', quando, canal: 'whatsapp', userData, testEventCode: ' TEST123 ' }).test_event_code).toBe('TEST123');
    });
});

describe('prazo e tentativas', () => {
    it('a Meta aceita até 7 dias', () => {
        expect(dentroDoPrazo(new Date(AGORA - 6 * DIA), AGORA)).toBe(true);
        expect(dentroDoPrazo(new Date(AGORA - 7 * DIA), AGORA)).toBe(false);
    });

    it('espera crescente e desiste no limite', () => {
        const quando = new Date(AGORA);
        expect(proximaTentativa(1, quando, AGORA)?.getTime()).toBe(AGORA + 5 * MIN);
        expect(proximaTentativa(2, quando, AGORA)?.getTime()).toBe(AGORA + 15 * MIN);
        expect(proximaTentativa(7, quando, AGORA)?.getTime()).toBe(AGORA + 24 * 60 * MIN);
        expect(proximaTentativa(MAX_TENTATIVAS, quando, AGORA)).toBeNull();
    });

    it('não agenda depois do prazo de 7 dias', () => {
        expect(proximaTentativa(5, new Date(AGORA - 7 * DIA + 30 * MIN), AGORA)).toBeNull();
    });

    it('só parâmetro inválido é definitivo', () => {
        expect(erroDefinitivo(400, 100)).toBe(true);
        expect(erroDefinitivo(400, 190)).toBe(false);
        expect(erroDefinitivo(500, null)).toBe(false);
        expect(erroDefinitivo(429, 4)).toBe(false);
    });
});

describe('formulário da configuração', () => {
    it('dataset só com números; token e código conferidos', () => {
        expect(normalizarConfig({ datasetId: 'abc' }, false).erro).toMatch(/só números/);
        expect(normalizarConfig({ datasetId: '123456789', token: 'curto' }, false).erro).toMatch(/Token/);
        expect(normalizarConfig({ datasetId: '123456789', testEventCode: 'com espaço' }, false).erro).toMatch(/Código/);
    });

    it('ligar pede o dataset e um token (o salvo vale)', () => {
        expect(normalizarConfig({ ativo: true }, false).erro).toMatch(/conjunto de dados/);
        expect(normalizarConfig({ ativo: true, datasetId: '123456789' }, false).erro).toMatch(/token/);
        expect(normalizarConfig({ ativo: true, datasetId: '123456789' }, true)).toEqual({
            config: { ativo: true, datasetId: '123456789', testEventCode: null, valorPadrao: null },
            erro: null,
        });
    });

    it('token novo vai para gravar; valor padrão em reais', () => {
        const r = normalizarConfig(
            { ativo: true, datasetId: ' 123 456 789 ', token: 'EAAG' + 'x'.repeat(40), testEventCode: 'TEST123', valorPadrao: '89.900,50' },
            false,
        );
        expect(r.config).toMatchObject({ datasetId: '123456789', token: 'EAAG' + 'x'.repeat(40), testEventCode: 'TEST123', valorPadrao: 89900.5 });
        expect(normalizarConfig({ valorPadrao: '-1' }, false).erro).toMatch(/Valor/);
    });

    it('reais escritos de vários jeitos', () => {
        expect(numeroDeReais('89.900,50')).toBe(89900.5);
        expect(numeroDeReais('89900.50')).toBe(89900.5);
        expect(numeroDeReais('R$ 89.900')).toBe(89900);
        expect(numeroDeReais('1500')).toBe(1500);
    });
});

// ── Fila no servidor ─────────────────────────────────────────

const LOJA = 'loja-1';
let fetchMock: ReturnType<typeof vi.fn>;
let respostas: Array<{ status: number; body: unknown }>;

function chamadasDaMeta() {
    return fetchMock.mock.calls.map(([url, init]) => ({ url: String(url), init, body: init?.body ? JSON.parse(String(init.body)) : null }));
}

async function rodarDepois() {
    const fila = fakes.depois.splice(0);
    for (const fn of fila) await fn();
}

function semear(p: {
    stage?: string;
    stageId?: unknown;
    origem?: Record<string, unknown> | null;
    phone?: string;
    canal?: 'whatsapp' | 'messenger' | 'instagram';
    config?: Record<string, unknown> | null;
    colunas?: Array<Record<string, unknown>>;
    criadaHa?: number;
}) {
    const [contato] = fakes.contatos.reset([{ tenantId: LOJA, phone: p.phone ?? '+5531999998888', name: 'Ana Souza' }]);
    const kind = p.canal ?? 'whatsapp';
    const [canal] = fakes.canais.reset([
        { tenantId: LOJA, kind, status: 'connected', wabaId: '1029', fbPageId: '55', igUserId: '1784', createdAt: new Date(AGORA - DIA) },
    ]);
    const [conv] = fakes.conversas.reset([
        {
            tenantId: LOJA,
            contactId: contato._id,
            channelId: canal._id,
            stage: p.stage ?? 'ganho',
            stageId: p.stageId ?? null,
            origem: p.origem === undefined ? { canal: 'whatsapp', ctwaClid: 'ARAkLk', idOrigem: '120210', em: new Date(AGORA - DIA) } : p.origem,
            createdAt: new Date(AGORA - (p.criadaHa ?? 3 * DIA)),
        },
    ]);
    fakes.colunas.reset(p.colunas ?? []);
    fakes.config.reset(
        p.config === null
            ? []
            : [{ tenantId: LOJA, ativo: true, datasetId: '123456789', token: 'enc:EAAGtoken', valorPadrao: null, ...(p.config ?? {}) }],
    );
    return { conv, contato };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    fakes.depois.length = 0;
    fakes.wabaDoGateway = null;
    for (const k of ['eventos', 'carros', 'agenda', 'veiculos', 'settings']) fakes[k].reset([]);
    respostas = [];
    fetchMock = vi.fn(async () => {
        const r = respostas.shift() ?? { status: 200, body: { events_received: 1, fbtrace_id: 'trace' } };
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as any;
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('venda que veio de anúncio', () => {
    it('registra, manda depois da resposta e grava enviado', async () => {
        const { conv } = semear({});
        fakes.carros.reset([{ tenantId: LOJA, conversationId: conv._id, ref: 'L1A2B3', preco: 89900 }]);

        const id = await registrarEventoDaColuna({ conversationId: String(conv._id), por: 'ana@loja.com' });
        expect(id).toBeTruthy();
        // Nada sai antes da resposta da rota.
        expect(fetchMock).not.toHaveBeenCalled();
        await rodarDepois();

        const [chamada] = chamadasDaMeta();
        expect(chamada.url).toBe('https://graph.facebook.com/v21.0/123456789/events');
        expect(chamada.init.headers.Authorization).toBe('Bearer EAAGtoken');
        expect(chamada.body).toEqual({
            data: [
                {
                    event_name: 'Purchase',
                    event_time: Math.floor(AGORA / 1000),
                    event_id: String(id),
                    action_source: 'business_messaging',
                    messaging_channel: 'whatsapp',
                    user_data: { whatsapp_business_account_id: '1029', ctwa_clid: 'ARAkLk' },
                    custom_data: { currency: 'BRL', value: 89900 },
                },
            ],
        });
        const ev = fakes.eventos.byId(id);
        expect(ev).toMatchObject({ status: 'enviado', evento: 'Purchase', valor: 89900, tentativas: 1, colunaNome: 'Vendido', por: 'ana@loja.com' });
        expect(ev.reservadoAte).toBeNull();
    });

    it('a mesma venda nunca sai duas vezes, mesmo indo e voltando da coluna', async () => {
        const { conv } = semear({});
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        await rodarDepois();
        fakes.conversas.byId(conv._id).stage = 'pagamento';
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        fakes.conversas.byId(conv._id).stage = 'ganho';
        expect(await registrarEventoDaColuna({ conversationId: String(conv._id) })).toBeNull();
        await rodarDepois();
        expect(fakes.eventos.docs).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('dois registros ao mesmo tempo: o índice único deixa um', async () => {
        const { conv } = semear({});
        const ids = await Promise.all([
            registrarEventoDaColuna({ conversationId: String(conv._id) }),
            registrarEventoDaColuna({ conversationId: String(conv._id) }),
        ]);
        expect(ids.filter(Boolean)).toHaveLength(1);
        expect(fakes.eventos.docs).toHaveLength(1);
    });

    it('coluna sem evento não registra nada', async () => {
        const { conv } = semear({ stage: 'conversa' });
        expect(await registrarEventoDaColuna({ conversationId: String(conv._id) })).toBeNull();
        expect(fakes.eventos.docs).toHaveLength(0);
    });

    it('coluna antiga do tipo venda, sem o campo, manda Purchase; coluna própria com evento escolhido também', async () => {
        const vendido = new mongoose.Types.ObjectId();
        const quente = new mongoose.Types.ObjectId();
        const colunas = [
            { _id: vendido, tenantId: LOJA, name: 'Vendido', systemKey: 'ganho', type: 'won', position: 4 },
            { _id: quente, tenantId: LOJA, name: 'Lead quente', systemKey: null, type: 'open', position: 2, eventoMeta: 'LeadSubmitted' },
            { tenantId: LOJA, name: 'Em atendimento', systemKey: 'conversa', type: 'open', position: 1 },
        ];
        const { conv } = semear({ colunas });
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        expect(fakes.eventos.docs[0]).toMatchObject({ evento: 'Purchase', colunaNome: 'Vendido' });
        expect(String(fakes.eventos.docs[0].colunaId)).toBe(String(vendido));

        const outra = semear({ stage: 'conversa', stageId: quente, colunas });
        await registrarEventoDaColuna({ conversationId: String(outra.conv._id) });
        expect(fakes.eventos.docs.map((e: any) => e.evento)).toContain('LeadSubmitted');
    });
});

describe('o que não vai fica com o motivo', () => {
    it('sem configuração: ignorado e nunca tentado', async () => {
        const { conv } = semear({ config: null });
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        expect(fakes.eventos.docs[0]).toMatchObject({ status: 'ignorado', motivo: 'sem configuração', proximaEm: null });
        expect(fakes.depois).toHaveLength(0);
        expect(await reenviarEventosMeta()).toMatchObject({ processados: 0 });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('WhatsApp sem ctwa_clid: sem clique do anúncio', async () => {
        const { conv } = semear({ origem: { canal: 'whatsapp', ctwaClid: null, idOrigem: '120', em: new Date() } });
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        expect(fakes.eventos.docs[0]).toMatchObject({ status: 'ignorado', motivo: 'sem clique do anúncio' });
    });

    it('conversa que não veio de anúncio', async () => {
        const { conv } = semear({ origem: null });
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        expect(fakes.eventos.docs[0]).toMatchObject({ status: 'ignorado', motivo: 'não veio de anúncio', canal: null });
    });

    it('sem o id do canal na hora de mandar: ignorado, sem chamar a Meta', async () => {
        const { conv } = semear({});
        fakes.canais.docs[0].wabaId = undefined;
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        await rodarDepois();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(fakes.eventos.docs[0]).toMatchObject({ status: 'ignorado', motivo: 'sem o id da conta do WhatsApp (WABA)' });
    });

    it('pelo gateway sem o WABA no canal: pergunta à conexão', async () => {
        const { conv } = semear({});
        Object.assign(fakes.canais.docs[0], { wabaId: undefined, provider: 'chatrun', chatrunConnectionId: 'conn-1' });
        fakes.wabaDoGateway = '7788';
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        await rodarDepois();
        expect(chamadasDaMeta()[0].body.data[0].user_data.whatsapp_business_account_id).toBe('7788');
    });
});

describe('Messenger e Direct', () => {
    it('Messenger manda a Página e o PSID do contato', async () => {
        const { conv } = semear({ canal: 'messenger', phone: 'fb:7788', origem: { canal: 'messenger', idOrigem: '120', em: new Date() } });
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        await rodarDepois();
        const item = chamadasDaMeta()[0].body.data[0];
        expect(item.messaging_channel).toBe('messenger');
        expect(item.user_data).toEqual({ page_id: '55', page_scoped_user_id: '7788' });
    });

    it('Direct manda a conta do Instagram e o IGSID', async () => {
        const { conv } = semear({ canal: 'instagram', phone: 'ig:9911', origem: { canal: 'instagram', idOrigem: '120', em: new Date() } });
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        await rodarDepois();
        expect(chamadasDaMeta()[0].body.data[0].user_data).toEqual({ instagram_business_account_id: '1784', ig_sid: '9911' });
    });
});

describe('chegada pelo anúncio', () => {
    const colunas = [{ tenantId: LOJA, name: 'Em atendimento', systemKey: 'conversa', type: 'open', position: 1, eventoMeta: 'LeadSubmitted' }];

    it('conversa nova: a primeira coluna manda o evento dela', async () => {
        const { conv } = semear({ stage: 'conversa', colunas, criadaHa: 2_000 });
        await registrarEventoDaColuna({ conversationId: String(conv._id), por: 'anuncio', soConversaNova: true });
        expect(fakes.eventos.docs[0]).toMatchObject({ evento: 'LeadSubmitted', status: 'pendente' });
    });

    it('conversa antiga com clique novo não reenvia a coluna em que já estava', async () => {
        const { conv } = semear({ stage: 'conversa', colunas, criadaHa: 2 * DIA });
        expect(await registrarEventoDaColuna({ conversationId: String(conv._id), soConversaNova: true })).toBeNull();
        expect(fakes.eventos.docs).toHaveLength(0);
    });
});

describe('falhas e worker', () => {
    it('falha temporária volta para a fila; o worker manda quando vence', async () => {
        const { conv } = semear({});
        respostas.push({ status: 500, body: { error: { message: 'Service temporarily unavailable', code: 2 } } });
        const id = await registrarEventoDaColuna({ conversationId: String(conv._id) });
        await rodarDepois();
        expect(fakes.eventos.byId(id)).toMatchObject({ status: 'pendente', tentativas: 1, ultimoErro: 'Service temporarily unavailable' });
        expect(fakes.eventos.byId(id).proximaEm.getTime()).toBe(AGORA + 5 * MIN);

        // Antes da hora, o worker não pega.
        expect(await reenviarEventosMeta()).toMatchObject({ processados: 0 });
        vi.setSystemTime(AGORA + 6 * MIN);
        expect(await reenviarEventosMeta()).toMatchObject({ processados: 1, enviados: 1 });
        expect(fakes.eventos.byId(id)).toMatchObject({ status: 'enviado', tentativas: 2, ultimoErro: null });
        // O event_time é o da entrada na coluna, não o do reenvio.
        expect(chamadasDaMeta()[1].body.data[0].event_time).toBe(Math.floor(AGORA / 1000));
    });

    it('reserva atômica: dois envios do mesmo registro, uma chamada só', async () => {
        const { conv } = semear({});
        const id = await registrarEventoDaColuna({ conversationId: String(conv._id) });
        fakes.depois.length = 0;
        const [a, b] = await Promise.all([enviarEventoMeta(id!), enviarEventoMeta(id!)]);
        expect([a, b].filter(Boolean)).toEqual(['enviado']);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reserva presa (quem enviava caiu) volta pelo worker', async () => {
        const { conv } = semear({});
        const id = await registrarEventoDaColuna({ conversationId: String(conv._id) });
        fakes.depois.length = 0;
        Object.assign(fakes.eventos.byId(id), { status: 'enviando', tentativas: 1, reservadoAte: new Date(AGORA - MIN) });
        expect(await reenviarEventosMeta()).toMatchObject({ enviados: 1 });
    });

    it('parâmetro inválido: falhou sem tentar de novo', async () => {
        const { conv } = semear({});
        respostas.push({ status: 400, body: { error: { message: 'Invalid parameter', code: 100, fbtrace_id: 'abc' } } });
        const id = await registrarEventoDaColuna({ conversationId: String(conv._id) });
        await rodarDepois();
        expect(fakes.eventos.byId(id)).toMatchObject({ status: 'falhou', motivo: 'recusado pela Meta', fbtraceId: 'abc' });
    });

    it('depois de 7 dias desiste sem chamar a Meta', async () => {
        const { conv } = semear({});
        respostas.push({ status: 500, body: {} });
        const id = await registrarEventoDaColuna({ conversationId: String(conv._id) });
        await rodarDepois();
        vi.setSystemTime(AGORA + 7 * DIA);
        await reenviarEventosMeta();
        expect(fakes.eventos.byId(id)).toMatchObject({ status: 'falhou', motivo: 'passou do prazo de 7 dias da Meta' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('desligaram depois que entrou na fila: não manda', async () => {
        const { conv } = semear({});
        const id = await registrarEventoDaColuna({ conversationId: String(conv._id) });
        fakes.config.docs[0].ativo = false;
        await rodarDepois();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(fakes.eventos.byId(id)).toMatchObject({ status: 'ignorado', motivo: 'sem configuração' });
    });
});

describe('valor da venda', () => {
    it('carro da conversa, senão o do agendamento, senão o padrão, senão 0', async () => {
        const conv = new mongoose.Types.ObjectId();
        const [veiculo] = fakes.veiculos.reset([{ preco: 75000 }]);
        expect(await valorDaVenda(LOJA, conv, null)).toBe(0);
        expect(await valorDaVenda(LOJA, conv, 50000)).toBe(50000);
        fakes.agenda.reset([{ tenantId: LOJA, conversationId: conv, veiculoId: veiculo._id, inicio: new Date() }]);
        expect(await valorDaVenda(LOJA, conv, 50000)).toBe(75000);
        fakes.carros.reset([{ tenantId: LOJA, conversationId: conv, ref: 'N1A2B3', preco: 132990.9 }]);
        expect(await valorDaVenda(LOJA, conv, 50000)).toBe(132990.9);
        // Carro de outra loja não conta.
        fakes.carros.docs[0].tenantId = 'outra';
        fakes.agenda.docs[0].tenantId = 'outra';
        expect(await valorDaVenda(LOJA, conv, 50000)).toBe(50000);
    });
});

describe('testar conexão e a lista', () => {
    it('confere o dataset e, com o código, manda o evento de teste da última conversa de anúncio', async () => {
        semear({});
        respostas.push({ status: 200, body: { id: '123456789', name: 'Loja Auto' } });
        const r = await testarConexao(LOJA, { testEventCode: 'TEST123' });
        expect(r).toMatchObject({ ok: true, dataset: { id: '123456789', name: 'Loja Auto' }, teste: { enviado: true } });
        const [get, post] = chamadasDaMeta();
        expect(get.url).toBe('https://graph.facebook.com/v21.0/123456789?fields=id,name');
        expect(post.body.test_event_code).toBe('TEST123');
        expect(post.body.data[0].user_data.ctwa_clid).toBe('ARAkLk');
        expect(fakes.config.docs[0].ultimoTeste).toMatchObject({ ok: true });
    });

    it('token recusado volta a mensagem em português', async () => {
        semear({});
        respostas.push({ status: 400, body: { error: { message: 'Invalid OAuth access token', code: 190 } } });
        const r = await testarConexao(LOJA, { token: 'EAAGnovo' + 'x'.repeat(30) });
        expect(r.ok).toBe(false);
        expect(r.mensagem).toMatch(/Token inválido/);
        expect(chamadasDaMeta()[0].init.headers.Authorization).toBe(`Bearer EAAGnovo${'x'.repeat(30)}`);
    });

    it('a lista é só do dono e mostra o nome do contato', async () => {
        const { conv } = semear({});
        await registrarEventoDaColuna({ conversationId: String(conv._id) });
        fakes.eventos.docs.push({ ...fakes.eventos.docs[0], _id: new mongoose.Types.ObjectId(), tenantId: 'outra' });
        const linhas = await eventosRecentes(LOJA);
        expect(linhas).toHaveLength(1);
        expect(linhas[0]).toMatchObject({ contato: 'Ana Souza', evento: 'Purchase', canal: 'whatsapp', status: 'pendente' });
    });
});
