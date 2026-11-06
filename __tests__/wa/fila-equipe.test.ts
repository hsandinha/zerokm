// @vitest-environment node
// Fila da equipe (wa/lib/fila.ts): o rodízio entre quem está Online, a
// conversa que entra fora do horário esperando a abertura, o aviso ao cliente
// no máximo uma vez a cada N horas e o registro do atendimento. Coleções
// falsas em memória; push e envio são espiões.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
const espioes = vi.hoisted(() => ({
    push: [] as Array<{ emails: string[]; titulo: string }>,
    enviados: [] as Array<{ text: string; sender: string }>,
    op: null as any,
    equipe: new Set<string>(),
}));

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
vi.mock('@wa/models/wa', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    class Fake extends FakeModel {
        findById(id: unknown) {
            return this.findOne({ _id: id });
        }
    }
    fakes.conversations = new Fake();
    fakes.messages = new Fake();
    fakes.contacts = new Fake();
    return { WaConversation: fakes.conversations, WaMessage: fakes.messages, WaContact: fakes.contacts };
});
vi.mock('@wa/models/operacao', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.atendentes = new FakeModel();
    fakes.atendimentos = new FakeModel();
    fakes.ops = new FakeModel();
    return { WaAtendente: fakes.atendentes, WaAtendimento: fakes.atendimentos, WaConversaOperacao: fakes.ops };
});
vi.mock('@wa/lib/operacao', () => ({ operacaoDaLoja: async () => espioes.op }));
vi.mock('@wa/lib/push', () => ({
    enviarPush: async (p: { emails: string[]; aviso: { titulo: string } }) => {
        espioes.push.push({ emails: p.emails, titulo: p.aviso.titulo });
        return p.emails.length;
    },
    urlDaConversa: (_t: string | null, id: string) => `/c/${id}`,
}));
vi.mock('@wa/lib/send', () => ({
    podeMandarLivre: () => true,
    sendAndLogText: async (p: { conversationId: string; text: string; sender: string }) => {
        espioes.enviados.push({ text: p.text, sender: p.sender });
        // Como o envio de verdade: a mensagem fica gravada com o wamid.
        fakes.messages.docs.push({
            _id: new mongoose.Types.ObjectId(),
            conversationId: new mongoose.Types.ObjectId(p.conversationId),
            direction: 'outbound',
            sender: p.sender,
            content: p.text,
            mediaType: 'text',
            externalId: `wamid.${fakes.messages.docs.length}`,
            createdAt: new Date(),
        });
        return true;
    },
}));
vi.mock('@wa/lib/channels', () => ({ channelForConversation: async () => ({ kind: 'whatsapp' }) }));
vi.mock('@wa/lib/equipe-loja', () => ({ emailsDaEquipe: async () => espioes.equipe }));
vi.mock('@wa/lib/webhooks', () => ({ emitEvent: async () => undefined }));

import { readFileSync } from 'node:fs';
import {
    FALAS_DE_TRANSFERENCIA,
    FALA_UM_INSTANTE,
    aposAcaoDaEquipe,
    aposTurnoDaIa,
    distribuirFila,
    entrouNaFila,
    mensagemParaEquipe,
    transferenciaForaDoHorario,
    varrerFila,
} from '@wa/lib/fila';
import { horarioPadrao } from '@wa/lib/horario';

const LOJA = new mongoose.Types.ObjectId().toHexString();
const recente = (ms: number) => new Date(Date.now() - ms);

function operacao(extra: { aberta?: boolean; distribuicao?: 'manual' | 'rodizio' } = {}) {
    const horario = horarioPadrao();
    // Aberta: todos os dias 0h às 24h; fechada: nenhum dia aberto.
    horario.ativo = true;
    horario.dias = horario.dias.map((d) => ({
        dia: d.dia,
        faixas: extra.aberta === false ? [] : [{ abre: '00:00', fecha: '24:00' }],
    }));
    return { horario, distribuicao: extra.distribuicao ?? 'rodizio', slaMinutos: 15 };
}

let contato: any;
function conversa(extra: Record<string, unknown> = {}) {
    const c = {
        _id: new mongoose.Types.ObjectId(),
        tenantId: LOJA,
        contactId: contato._id,
        status: 'waiting_human',
        waitingSince: new Date(),
        lastInboundAt: new Date(),
        transferReason: 'pediu_humano',
        ...extra,
    };
    fakes.conversations.docs.push(c);
    return c;
}

beforeEach(() => {
    espioes.push.length = 0;
    espioes.enviados.length = 0;
    espioes.op = operacao();
    espioes.equipe = new Set(['ana@loja.com', 'bia@loja.com', 'caio@loja.com', 'davi@loja.com']);
    [contato] = fakes.contacts.reset([{ tenantId: LOJA, phone: '+5531999990000', name: 'Marina', optOut: false }]);
    fakes.conversations.reset([]);
    fakes.messages.reset([]);
    fakes.atendimentos.reset([]);
    fakes.ops.reset([]);
    fakes.atendentes.reset([
        { tenantId: LOJA, email: 'ana@loja.com', nome: 'Ana', status: 'online', vistoEm: recente(10_000), ultimaAtribuicaoEm: recente(60_000) },
        { tenantId: LOJA, email: 'bia@loja.com', nome: 'Bia', status: 'online', vistoEm: recente(10_000), ultimaAtribuicaoEm: null },
        { tenantId: LOJA, email: 'caio@loja.com', status: 'pausa', vistoEm: recente(10_000), ultimaAtribuicaoEm: null },
        // Online, mas sem sinal há 10 minutos: painel fechado.
        { tenantId: LOJA, email: 'davi@loja.com', status: 'online', vistoEm: recente(600_000), ultimaAtribuicaoEm: null },
    ]);
});

describe('rodízio', () => {
    it('entrega ao Online que recebeu há mais tempo, registra e avisa só ele', async () => {
        const c = conversa();
        await entrouNaFila(String(c._id));
        expect(fakes.conversations.byId(c._id).assignedTo).toBe('bia@loja.com');
        const at = fakes.atendimentos.docs[0];
        expect(at).toMatchObject({ atendente: 'bia@loja.com', distribuida: true, aberto: true });
        expect(espioes.push).toEqual([{ emails: ['bia@loja.com'], titulo: 'Conversa nova para você' }]);
        expect(fakes.messages.docs.some((m: any) => m.mediaType === 'evento' && /Bia/.test(m.content))).toBe(true);

        // A próxima vai para a Ana (a Bia acabou de receber); Pausa e painel fechado nunca.
        const c2 = conversa();
        await entrouNaFila(String(c2._id));
        expect(fakes.conversations.byId(c2._id).assignedTo).toBe('ana@loja.com');
    });

    it('quem devolveu para a fila não recebe de volta e a fila é avisada de novo', async () => {
        const c = conversa({ status: 'waiting_human', assignedTo: null });
        fakes.atendimentos.docs.push({
            _id: new mongoose.Types.ObjectId(),
            tenantId: LOJA,
            conversationId: c._id,
            aberto: true,
            abertoEm: new Date(),
            atendente: 'bia@loja.com',
            transferencias: 0,
            distribuida: false,
            aguardandoAbertura: false,
            filaAvisadaEm: new Date(),
        });
        await aposAcaoDaEquipe(String(c._id), 'bia@loja.com');
        expect(fakes.conversations.byId(c._id).assignedTo).toBe('ana@loja.com');
    });

    it('distribuição manual: ninguém recebe, os Online são avisados uma vez', async () => {
        espioes.op = operacao({ distribuicao: 'manual' });
        const c = conversa();
        await entrouNaFila(String(c._id));
        await entrouNaFila(String(c._id));
        expect(fakes.conversations.byId(c._id).assignedTo).toBeUndefined();
        expect(espioes.push).toHaveLength(1);
        expect(espioes.push[0].emails.sort()).toEqual(['ana@loja.com', 'bia@loja.com']);
    });

    it('transferência para um colega avisa o colega', async () => {
        const c = conversa({ assignedTo: 'caio@loja.com' });
        await aposAcaoDaEquipe(String(c._id), 'ana@loja.com');
        expect(fakes.conversations.byId(c._id).assignedTo).toBe('caio@loja.com');
        expect(espioes.push).toEqual([{ emails: ['caio@loja.com'], titulo: 'Conversa transferida para você' }]);
    });

    it('cliente que volta com o dono antigo fora do ar: no rodízio vai para quem está Online', async () => {
        // A IA reassumiu (conversa esquecida) e transferiu de novo: o dono é
        // do ciclo anterior e está com o painel fechado.
        const c = conversa({ status: 'ai_active', assignedTo: 'davi@loja.com' });
        fakes.conversations.byId(c._id).status = 'waiting_human';
        await aposTurnoDaIa(String(c._id), 'ai_active');
        expect(fakes.conversations.byId(c._id).assignedTo).toBe('bia@loja.com');
        expect(fakes.atendimentos.docs[0]).toMatchObject({ atendente: 'bia@loja.com', distribuida: true });
        expect(espioes.push).toEqual([{ emails: ['bia@loja.com'], titulo: 'Conversa nova para você' }]);
    });

    it('cliente que volta com o dono antigo fora do ar: na distribuição manual a fila também é avisada', async () => {
        espioes.op = operacao({ distribuicao: 'manual' });
        const c = conversa({ assignedTo: 'davi@loja.com' });
        await aposTurnoDaIa(String(c._id), 'ai_active');
        expect(fakes.conversations.byId(c._id).assignedTo).toBe('davi@loja.com');
        expect(espioes.push).toContainEqual({ emails: ['davi@loja.com'], titulo: 'Conversa esperando você' });
        const fila = espioes.push.find((p) => p.titulo === 'Conversa nova na fila');
        expect(fila?.emails.sort()).toEqual(['ana@loja.com', 'bia@loja.com']);
    });

    it('dono Online continua com a conversa', async () => {
        const c = conversa({ assignedTo: 'ana@loja.com' });
        await aposTurnoDaIa(String(c._id), 'ai_active');
        expect(fakes.conversations.byId(c._id).assignedTo).toBe('ana@loja.com');
        expect(espioes.push).toEqual([{ emails: ['ana@loja.com'], titulo: 'Conversa esperando você' }]);
    });

    it('transferida na mão para quem saiu da equipe volta para o rodízio', async () => {
        const c = conversa({ assignedTo: 'caio@loja.com' });
        await aposAcaoDaEquipe(String(c._id), 'ana@loja.com');
        // Ainda é da equipe (em Pausa): fica esperando por ele.
        expect(await distribuirFila(LOJA)).toBe(0);
        espioes.equipe.delete('caio@loja.com');
        expect(await distribuirFila(LOJA)).toBe(1);
        expect(fakes.conversations.byId(c._id).assignedTo).toBe('bia@loja.com');
    });
});

describe('fora do horário', () => {
    it('a conversa espera a abertura: sem dono, sem aviso; ao abrir, conta dali e distribui', async () => {
        espioes.op = operacao({ aberta: false });
        const c = conversa({ waitingSince: recente(8 * 3600_000) });
        await entrouNaFila(String(c._id));
        expect(fakes.conversations.byId(c._id).assignedTo).toBeUndefined();
        expect(espioes.push).toHaveLength(0);
        expect(fakes.atendimentos.docs[0].aguardandoAbertura).toBe(true);

        espioes.op = operacao({ aberta: true });
        const r = await varrerFila();
        expect(r.abertas).toBe(1);
        const depois = fakes.conversations.byId(c._id);
        expect(Date.now() - depois.waitingSince.getTime()).toBeLessThan(5_000);
        expect(depois.assignedTo).toBe('bia@loja.com');
        expect(fakes.atendimentos.docs[0].aguardandoAbertura).toBe(false);
    });

    it('duas varreduras sobrepostas abrem a conversa uma vez só', async () => {
        espioes.op = operacao({ aberta: false });
        const c = conversa({ waitingSince: recente(8 * 3600_000) });
        await entrouNaFila(String(c._id));
        espioes.op = operacao({ aberta: true, distribuicao: 'manual' });
        const [a, b] = await Promise.all([varrerFila(), varrerFila()]);
        expect(a.abertas + b.abertas).toBe(1);
        expect(espioes.push.filter((p) => p.titulo === 'Conversa nova na fila')).toHaveLength(1);
    });

    it('sem IA: mensagem automática da loja, no máximo uma a cada N horas', async () => {
        espioes.op = operacao({ aberta: false });
        const c = conversa({ status: 'waiting_human' });
        fakes.messages.docs.push({ conversationId: c._id, direction: 'inbound', sender: 'contact', createdAt: new Date() });
        await aposTurnoDaIa(String(c._id), 'ai_active');
        await mensagemParaEquipe(String(c._id));
        await mensagemParaEquipe(String(c._id));
        expect(espioes.enviados).toHaveLength(1);
        expect(espioes.enviados[0].sender).toBe('system');
        expect(espioes.enviados[0].text).toContain('Nosso horário de atendimento');

        // Passou o intervalo: manda de novo.
        fakes.ops.docs[0].foraDoHorarioEm = recente(13 * 3600_000);
        await mensagemParaEquipe(String(c._id));
        expect(espioes.enviados).toHaveLength(2);
    });

    it('com a IA que já falou: sem aviso a mais (o prompt dela traz o horário)', async () => {
        espioes.op = operacao({ aberta: false });
        espioes.op.horario.dias[1].faixas = [{ abre: '08:00', fecha: '18:00' }];
        const c = conversa();
        const t = Date.now();
        fakes.messages.docs.push(
            { conversationId: c._id, direction: 'inbound', sender: 'contact', createdAt: new Date(t - 5000) },
            { conversationId: c._id, direction: 'outbound', sender: 'ai', content: 'A equipe responde amanhã a partir das 8h', createdAt: new Date(t - 1000) },
        );
        await aposTurnoDaIa(String(c._id), 'ai_active');
        expect(espioes.enviados).toHaveLength(0);
    });

    it('com a IA que não falou (falhou): vai a mensagem automática de fora do horário', async () => {
        espioes.op = operacao({ aberta: false });
        espioes.op.horario.dias[1].faixas = [{ abre: '08:00', fecha: '18:00' }];
        const c = conversa();
        fakes.messages.docs.push({ conversationId: c._id, direction: 'inbound', sender: 'contact', createdAt: new Date(Date.now() - 5000) });
        await aposTurnoDaIa(String(c._id), 'ai_active');
        expect(espioes.enviados).toHaveLength(1);
        expect(espioes.enviados[0].text).toContain('Nosso horário de atendimento');
    });

    it('IA falhou com a loja fechada: no lugar do "um instante", o aviso de quando a equipe volta, uma vez', async () => {
        espioes.op = operacao({ aberta: false });
        espioes.op.horario.dias[1].faixas = [{ abre: '08:00', fecha: '18:00' }];
        const c = conversa();
        fakes.messages.docs.push({ conversationId: c._id, direction: 'inbound', sender: 'contact', createdAt: new Date(Date.now() - 5000) });
        // O que o worker faz (failToHuman): primeiro o aviso, depois a fila.
        expect(await transferenciaForaDoHorario(String(c._id))).toBe(true);
        await aposTurnoDaIa(String(c._id), 'ai_active');
        expect(espioes.enviados).toHaveLength(1);
        expect(espioes.enviados[0].text).toContain('Nossa equipe está fora do horário agora');
        expect(espioes.enviados.some((e) => e.text === FALA_UM_INSTANTE)).toBe(false);

        // Loja aberta: o worker manda o "um instante" de sempre.
        espioes.op = operacao({ aberta: true });
        expect(await transferenciaForaDoHorario(String(c._id))).toBe(false);
    });

    it('fala fixa de transferência ("um instante", limite da IA) não barra o aviso de horário', async () => {
        espioes.op = operacao({ aberta: false });
        espioes.op.horario.dias[1].faixas = [{ abre: '08:00', fecha: '18:00' }];
        for (const fala of FALAS_DE_TRANSFERENCIA) {
            espioes.enviados.length = 0;
            fakes.ops.reset([]);
            const c = conversa();
            const t = Date.now();
            fakes.messages.docs.push(
                { conversationId: c._id, direction: 'inbound', sender: 'contact', createdAt: new Date(t - 5000) },
                // Mandada de verdade (com wamid), antes da transferência.
                { conversationId: c._id, direction: 'outbound', sender: fala === FALA_UM_INSTANTE ? 'system' : 'ai', content: fala, externalId: `wamid.${t}`, createdAt: new Date(t - 1000) },
            );
            await aposTurnoDaIa(String(c._id), 'ai_active');
            expect(espioes.enviados).toHaveLength(1);
            expect(espioes.enviados[0].text).toContain('Nossa equipe está fora do horário agora');
        }
    });

    it('o texto fixo do limite de mensagens é o mesmo da IA da loja', () => {
        const fonte = readFileSync(new URL('../../wa/lib/ai-loja.ts', import.meta.url), 'utf8');
        for (const fala of FALAS_DE_TRANSFERENCIA.filter((f) => f !== FALA_UM_INSTANTE)) {
            expect(fonte).toContain(JSON.stringify(fala));
        }
        const worker = readFileSync(new URL('../../app/api/wa/workers/ai/route.ts', import.meta.url), 'utf8');
        expect(worker).toContain('FALA_UM_INSTANTE');
    });

    it('vendedor no meio da conversa depois do expediente: sem aviso de fora do horário', async () => {
        espioes.op = operacao({ aberta: false });
        const c = conversa({ status: 'human_active', assignedTo: 'ana@loja.com', waitingSince: null });
        const t = Date.now();
        fakes.messages.docs.push(
            { conversationId: c._id, direction: 'outbound', sender: 'human', content: 'Te mando as fotos já', createdAt: new Date(t - 20 * 60_000) },
            { conversationId: c._id, direction: 'inbound', sender: 'contact', content: 'Obrigado!', createdAt: new Date(t) },
        );
        await mensagemParaEquipe(String(c._id));
        expect(espioes.enviados).toHaveLength(0);
        expect(espioes.push).toEqual([{ emails: ['ana@loja.com'], titulo: 'Mensagem de Marina' }]);

        // Horas depois, sem resposta de ninguém: o aviso sai.
        fakes.messages.docs[0].createdAt = new Date(t - 3 * 3600_000);
        await mensagemParaEquipe(String(c._id));
        expect(espioes.enviados).toHaveLength(1);
    });

    it('não manda para quem pediu para sair', async () => {
        espioes.op = operacao({ aberta: false });
        contato.optOut = true;
        fakes.contacts.byId(contato._id).optOut = true;
        const c = conversa();
        await mensagemParaEquipe(String(c._id));
        expect(espioes.enviados).toHaveLength(0);
    });
});

describe('registro do atendimento', () => {
    it('anota a primeira resposta e fecha quando volta para a IA', async () => {
        espioes.op = operacao({ distribuicao: 'manual' });
        const c = conversa();
        await entrouNaFila(String(c._id));
        const respondeuEm = new Date(Date.now() + 1000);
        fakes.messages.docs.push({
            conversationId: c._id,
            direction: 'outbound',
            sender: 'human',
            authorEmail: 'Ana@Loja.com',
            createdAt: respondeuEm,
        });
        Object.assign(fakes.conversations.byId(c._id), { status: 'human_active', assignedTo: 'ana@loja.com' });
        await varrerFila();
        expect(fakes.atendimentos.docs[0]).toMatchObject({
            atendente: 'ana@loja.com',
            primeiraRespostaPor: 'ana@loja.com',
            primeiraRespostaEm: respondeuEm,
        });

        Object.assign(fakes.conversations.byId(c._id), { status: 'ai_active', assignedTo: null });
        await aposAcaoDaEquipe(String(c._id), 'ana@loja.com');
        expect(fakes.atendimentos.docs[0]).toMatchObject({ aberto: false, desfecho: 'devolvida_ia', encerradoPor: 'ana@loja.com' });
    });
});
