// @vitest-environment node
// Worker das mensagens programadas (wa/lib/programadas-envio.ts): pega cada
// uma uma vez só, manda o texto com a janela aberta e o template com ela
// fechada, deixa nota interna quando não sai e não reenvia a que ficou presa
// em "enviando". Coleções falsas em memória.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
const envio = vi.hoisted(() => ({ texto: [] as any[], template: [] as any[], falhar: null as Error | null }));
const canal = vi.hoisted(() => ({ kind: 'whatsapp' }));

vi.mock('@/lib/mongodb', () => ({ default: async () => {} }));
vi.mock('@wa/models/central', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.programadas = new FakeModel();
    return { WaProgramada: fakes.programadas };
});
vi.mock('@wa/models/wa', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    class ComId extends FakeModel {
        findById(id: unknown) {
            return this.findOne({ _id: id });
        }
    }
    fakes.conversas = new ComId();
    fakes.contatos = new ComId();
    fakes.jobs = new FakeModel();
    fakes.followups = new FakeModel();
    return { WaConversation: fakes.conversas, WaContact: fakes.contatos, WaAiJob: fakes.jobs, WaFollowup: fakes.followups };
});
vi.mock('@wa/models/atendimento', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.notas = new FakeModel();
    return { WaNote: fakes.notas };
});
vi.mock('@wa/lib/channels', () => ({
    channelForConversation: async () => ({ kind: canal.kind, tenantId: 'loja-1' }),
    wabaCredentialsOf: async () => ({ token: '', phoneNumberId: '', wabaId: 'waba-1' }),
}));
vi.mock('@wa/lib/meta', async (original) => ({
    ...(await original<typeof import('@wa/lib/meta')>()),
    listTemplates: async () => [
        { id: 't1', name: 'retomar', language: 'pt_BR', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'Oi {{1}}, posso ajudar?' }] },
    ],
}));
vi.mock('@wa/lib/send', () => ({
    sendAndLogText: async (p: any) => {
        if (envio.falhar) throw envio.falhar;
        envio.texto.push(p);
        return true;
    },
    sendAndLogTemplate: async (p: any) => {
        envio.template.push(p);
        return 'wamid.t';
    },
}));

import { enviarProgramadasVencidas } from '@wa/lib/programadas-envio';

const oid = () => new mongoose.Types.ObjectId();
const LOJA = 'loja-1';
const min = (n: number) => new Date(Date.now() + n * 60_000);
const horas = (h: number) => new Date(Date.now() - h * 3600_000);

let conversa: any;

beforeEach(() => {
    envio.texto = [];
    envio.template = [];
    envio.falhar = null;
    canal.kind = 'whatsapp';
    const [contato] = fakes.contatos.reset([{ tenantId: LOJA, phone: '+5531999990000', optOut: false }]);
    [conversa] = fakes.conversas.reset([
        { tenantId: LOJA, contactId: contato._id, status: 'ai_active', lastInboundAt: horas(2), assignedTo: null },
    ]);
    fakes.programadas.reset([]);
    fakes.notas.reset([]);
    fakes.jobs.reset([{ conversationId: conversa._id, status: 'pending' }]);
    fakes.followups.reset([]);
});

function programar(extra: Record<string, unknown> = {}) {
    const p = {
        _id: oid(),
        tenantId: LOJA,
        conversationId: conversa._id,
        texto: 'Bom dia! Ainda tem interesse no Onix?',
        enviarEm: min(-1),
        modelo: null,
        situacao: 'programada',
        criadoPor: 'ana@loja.com',
        criadoPorNome: 'Ana',
        ...extra,
    };
    fakes.programadas.docs.push(p);
    return p;
}

describe('mensagens programadas', () => {
    it('janela aberta: sai o texto em nome de quem programou, e a IA para', async () => {
        const p = programar();
        programar({ enviarEm: min(30) }); // ainda não venceu
        expect(await enviarProgramadasVencidas()).toEqual({ enviadas: 1, falhas: 0 });
        expect(envio.texto).toHaveLength(1);
        expect(envio.texto[0]).toMatchObject({ text: p.texto, sender: 'human', author: { email: 'ana@loja.com', name: 'Ana' } });
        expect(fakes.programadas.byId(p._id)).toMatchObject({ situacao: 'enviada', saiuComo: 'texto' });
        expect(fakes.conversas.byId(conversa._id)).toMatchObject({ status: 'human_active', assignedTo: 'ana@loja.com' });
        expect(fakes.jobs.docs[0].status).toBe('done');
        // Rodar de novo não manda de novo.
        expect(await enviarProgramadasVencidas()).toEqual({ enviadas: 0, falhas: 0 });
    });

    it('janela fechada com template: sai o template escolhido', async () => {
        fakes.conversas.docs[0].lastInboundAt = horas(30);
        const p = programar({ modelo: { nome: 'retomar', idioma: 'pt_BR', params: ['João'], texto: 'Oi João, posso ajudar?' } });
        await enviarProgramadasVencidas();
        expect(envio.texto).toHaveLength(0);
        expect(envio.template[0]).toMatchObject({ templateName: 'retomar', bodyParams: ['João'], renderedText: 'Oi João, posso ajudar?' });
        expect(fakes.programadas.byId(p._id)).toMatchObject({ situacao: 'enviada', saiuComo: 'template' });
    });

    it('janela fechada sem template: não sai, e fica o motivo na nota interna', async () => {
        fakes.conversas.docs[0].lastInboundAt = horas(30);
        const p = programar();
        expect(await enviarProgramadasVencidas()).toEqual({ enviadas: 0, falhas: 1 });
        expect(envio.texto).toHaveLength(0);
        expect(fakes.programadas.byId(p._id)).toMatchObject({ situacao: 'falhou' });
        expect(fakes.programadas.byId(p._id).erro).toMatch(/24 horas/);
        expect(fakes.notas.docs).toHaveLength(1);
        expect(fakes.notas.docs[0]).toMatchObject({ authorEmail: 'ana@loja.com', tenantId: LOJA });
        expect(fakes.notas.docs[0].text).toMatch(/não saiu/);
        // A IA continua: nada saiu.
        expect(fakes.conversas.byId(conversa._id).status).toBe('ai_active');
    });

    it('opt-out e conversa de outra loja não recebem', async () => {
        fakes.contatos.docs[0].optOut = true;
        const a = programar();
        const b = programar({ tenantId: 'outra-loja' });
        await enviarProgramadasVencidas();
        expect(envio.texto).toHaveLength(0);
        expect(fakes.programadas.byId(a._id).erro).toMatch(/opt-out/);
        expect(fakes.programadas.byId(b._id).situacao).toBe('falhou');
    });

    it('presa em "enviando" vira falha com aviso, sem reenviar', async () => {
        const p = programar({ situacao: 'enviando', pegoEm: min(-15) });
        await enviarProgramadasVencidas();
        expect(envio.texto).toHaveLength(0);
        expect(fakes.programadas.byId(p._id).situacao).toBe('falhou');
        expect(fakes.programadas.byId(p._id).erro).toMatch(/pode ter saído/);
    });

    it('erro do envio vira falha com o motivo', async () => {
        envio.falhar = new Error('WABA não configurado');
        const p = programar();
        expect(await enviarProgramadasVencidas()).toEqual({ enviadas: 0, falhas: 1 });
        expect(fakes.programadas.byId(p._id)).toMatchObject({ situacao: 'falhou', erro: 'WABA não configurado' });
    });
});
