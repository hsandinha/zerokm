// @vitest-environment node
// Follow-up por coluna do funil (wa/lib/funil-followup.ts): a reserva do toque
// na conversa (conta antes de mandar, devolve se não saiu), o que fica de fora
// (opt-out, SMS, cadência de campanha pendente, cliente falou por último) e o
// horário. O envio em si (texto, IA ou template) é wa/lib/envio-automatico.ts
// e aqui é falso.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({ enviar: null as any, canal: 'whatsapp' }) as Record<string, any>);
vi.mock('@/lib/mongodb', () => ({ default: async () => null }));
vi.mock('@wa/models/wa', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.conversations = new FakeModel();
    fakes.contacts = new FakeModel();
    fakes.followups = new FakeModel();
    // findById do fake: o worker lê o contato por ele.
    (fakes.contacts as any).findById = (id: unknown) => fakes.contacts.findOne({ _id: id });
    return { WaConversation: fakes.conversations, WaContact: fakes.contacts, WaFollowup: fakes.followups };
});
vi.mock('@wa/lib/channels', () => ({
    channelForConversation: async () => ({ kind: fakes.canal }),
}));
vi.mock('@wa/lib/funil', () => ({
    colunasComFollowupLigado: async () => fakes.colunas,
    colunasDo: async () => fakes.colunas.map((c: any) => ({ id: c.id, name: c.name, color: 'azul', position: 0, systemKey: null, type: 'open' })),
    // A regra de qual cartão está na coluna é testada em funil-colunas.test.ts.
    filtroDaColuna: () => ({}),
}));
vi.mock('@wa/lib/envio-automatico', () => ({
    Rodada: class {
        esgotada = false;
        async dono() {
            return { liberado: true, recursos: { funil: true }, nome: 'Auto Center', store: {} };
        }
    },
    enviarAutomatico: (...args: unknown[]) => fakes.enviar(...args),
    escreverFollowupComIa: async () => 'texto da IA',
    reservarEnvio: async () => null,
    concluirEnvio: async () => undefined,
}));

import { runFunilFollowups } from '@wa/lib/funil-followup';
import { normalizarFollowup } from '@wa/lib/automacoes';

const HORA = 3600_000;
const AGORA = Date.parse('2026-11-06T13:00:00Z'); // 10h em Brasília
const ha = (h: number) => new Date(AGORA - h * HORA);
const COL = new mongoose.Types.ObjectId().toHexString();

let contato: any;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    fakes.canal = 'whatsapp';
    fakes.enviar = vi.fn(async () => ({ situacao: 'enviada', canal: 'whatsapp', como: 'texto' }));
    fakes.colunas = [
        {
            id: COL,
            tenantId: 'loja-1',
            name: 'Proposta',
            followup: normalizarFollowup({ ativo: true, horas: 4, maximo: 2, modo: 'texto', texto: 'Oi, {{nome}}!' }).config,
        },
    ];
    [contato] = fakes.contacts.reset([{ tenantId: 'loja-1', phone: '+5531999998888', name: 'Ana Souza', optOut: false }]);
    fakes.followups.reset([]);
});

afterEach(() => {
    vi.useRealTimers();
});

function conversa(extra: Record<string, unknown> = {}) {
    const [c] = fakes.conversations.reset([
        {
            tenantId: 'loja-1',
            contactId: contato._id,
            status: 'ai_active',
            lastMessageAt: ha(6),
            lastInboundAt: ha(7),
            followupCount: 0,
            followupLastAt: null,
            followupColunaId: null,
            ...extra,
        },
    ]);
    return c;
}

describe('follow-up da coluna', () => {
    it('reserva o toque na conversa e manda o texto com o nome', async () => {
        const c = conversa();
        const res = await runFunilFollowups();
        expect(res).toEqual({ sent: 1, skipped: 0, failed: 0 });
        const salvo = fakes.conversations.byId(c._id);
        expect(salvo.followupCount).toBe(1);
        expect(String(salvo.followupColunaId)).toBe(COL);
        expect(salvo.followupLastAt).toBeInstanceOf(Date);
        const pedido = fakes.enviar.mock.calls[0][1];
        expect(await pedido.texto()).toEqual({ texto: 'Oi, Ana!', como: 'texto' });
    });

    it('não saiu (sem template, fora da janela): devolve a contagem e guarda a data', async () => {
        fakes.enviar = vi.fn(async () => ({ situacao: 'pulada', motivo: 'janela de 24h fechada e sem template configurado' }));
        const c = conversa();
        const res = await runFunilFollowups();
        expect(res.skipped).toBe(1);
        const salvo = fakes.conversations.byId(c._id);
        expect(salvo.followupCount).toBe(0);
        // Volta à fila só depois de outro prazo.
        expect(salvo.followupLastAt).toBeInstanceOf(Date);
        expect((await runFunilFollowups()).skipped).toBe(0);
        expect(fakes.enviar).toHaveBeenCalledTimes(1);
    });

    it('chegou ao máximo da coluna: para', async () => {
        conversa({ followupCount: 2, followupColunaId: new mongoose.Types.ObjectId(COL), followupLastAt: ha(6) });
        await runFunilFollowups();
        expect(fakes.enviar).not.toHaveBeenCalled();
    });

    it('opt-out, SMS, cadência de campanha pendente e cliente falando por último ficam de fora', async () => {
        fakes.contacts.docs[0].optOut = true;
        conversa();
        await runFunilFollowups();
        fakes.contacts.docs[0].optOut = false;

        fakes.canal = 'sms';
        conversa();
        await runFunilFollowups();
        fakes.canal = 'whatsapp';

        const c = conversa();
        fakes.followups.reset([{ conversationId: c._id, status: 'pending' }]);
        await runFunilFollowups();
        fakes.followups.reset([]);

        conversa({ lastInboundAt: ha(6) });
        await runFunilFollowups();

        expect(fakes.enviar).not.toHaveBeenCalled();
    });

    it('de madrugada não sai nada', async () => {
        vi.setSystemTime(Date.parse('2026-11-06T06:00:00Z')); // 3h em Brasília
        conversa({ lastMessageAt: new Date(Date.parse('2026-11-06T00:00:00Z')), lastInboundAt: new Date(Date.parse('2026-11-05T23:00:00Z')) });
        expect(await runFunilFollowups()).toEqual({ sent: 0, skipped: 0, failed: 0 });
        expect(fakes.enviar).not.toHaveBeenCalled();
    });
});
