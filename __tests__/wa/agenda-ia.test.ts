// @vitest-environment node
// Agenda pela IA da loja (wa/lib/agenda-server.ts e o turno de
// wa/lib/ai-loja.ts): o pedido em horário ocupado ou fechado não é gravado e
// volta para a IA oferecer outro; remarcar uma visita confirmada move a
// mesma (volta para "a confirmar", com o lembrete zerado) em vez de deixar
// as duas; e o pedido de foto repetido não vira duas tarefas.
// Coleções falsas em memória; o modelo de IA é um roteiro.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
const roteiro = vi.hoisted(() => ({ respostas: [] as any[], chamadas: [] as any[] }));

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
vi.mock('@/models/RepasseVehicle', () => ({ default: {} }));
vi.mock('@wa/lib/store', () => ({
    getStore: async () => null,
    recursosDaLoja: async () => ({}),
    storeIsActive: () => true,
}));
vi.mock('@wa/lib/llm', async (original) => ({
    ...(await original<typeof import('@wa/lib/llm')>()),
    runLlm: async (p: any) => {
        roteiro.chamadas.push(p.messages.map((m: any) => ({ ...m })));
        return roteiro.respostas.shift() ?? { text: '', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 } };
    },
}));
vi.mock('@wa/models/agenda', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    // findOne devolve um "documento" com set/save, como o do mongoose.
    class Agendamentos extends FakeModel {
        findOne(filtro: Record<string, unknown>) {
            const q = super.findOne(filtro);
            const docs = this;
            const consulta = {
                sort(s: Record<string, 1 | -1>) {
                    q.sort(s);
                    return consulta;
                },
                then(ok: (v: any) => any, erro?: (e: unknown) => any) {
                    return q.then((d: any) => (d ? docs.documento(d) : null)).then(ok, erro);
                },
            };
            return consulta as any;
        }
        documento(copia: Record<string, any>) {
            const docs = this;
            return Object.assign(copia, {
                set(a: string | Record<string, unknown>, b?: unknown) {
                    if (typeof a === 'string') (this as any)[a] = b;
                    else Object.assign(this, a);
                    return this;
                },
                async save() {
                    const { set: _s, save: _v, ...campos } = this as any;
                    Object.assign(docs.byId(campos._id)!, campos);
                    return this;
                },
            });
        }
    }
    fakes.agendamentos = new Agendamentos();
    fakes.configs = new FakeModel();
    return { WaAgendamento: fakes.agendamentos, WaAgendaConfig: fakes.configs };
});
vi.mock('@wa/models/tarefa', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.tarefas = new FakeModel();
    return { WaTarefa: fakes.tarefas };
});

import { agendarPelaIa, conferirPedidoDaIa } from '@wa/lib/agenda-server';
import { CONFIG_PADRAO, dataLocal, horaLocal, instanteLocal } from '@wa/lib/agenda';
import { runStoreTurn } from '@wa/lib/ai-loja';
import { criarTarefa } from '@wa/lib/tarefas';

const LOJA = new mongoose.Types.ObjectId();
const TENANT = String(LOJA);
const conversa = { _id: new mongoose.Types.ObjectId(), assignedTo: null };
const contato = { _id: new mongoose.Types.ObjectId(), name: 'Ana Souza', phone: '+5531999998888' };
const store = { _id: LOJA, kind: 'lojista', ownerUserId: null } as any;
// Segunda a sexta, 9h às 18h, uma visita por vez (CONFIG_PADRAO).
const config = { tenantId: TENANT, ...CONFIG_PADRAO, antecedenciaMin: 0 };
const em = (dia: string, hora: string) => new Date(instanteLocal(dia, hora));

beforeEach(() => {
    // Domingo, 08/11/2026, meio-dia em Brasília.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(em('2026-11-08', '12:00'));
    fakes.configs.reset([config]);
    fakes.agendamentos.reset([]);
    fakes.tarefas.reset([]);
    roteiro.respostas = [];
    roteiro.chamadas = [];
});
afterEach(() => {
    vi.useRealTimers();
});

describe('pedido da IA na agenda', () => {
    it('horário livre: pode gravar', async () => {
        const r = await conferirPedidoDaIa({ tenantId: TENANT, conversationId: conversa._id, input: { data_iso: '2026-11-10T10:00' } });
        expect(r).toBeNull();
    });

    it('horário ocupado por outro cliente: não grava e devolve os livres para a IA', async () => {
        fakes.agendamentos.reset([
            { tenantId: TENANT, conversationId: new mongoose.Types.ObjectId(), inicio: em('2026-11-10', '10:00'), duracaoMin: 60, status: 'confirmado' },
        ]);
        const r = await conferirPedidoDaIa({ tenantId: TENANT, conversationId: conversa._id, input: { data_iso: '2026-11-10T10:00' } });
        expect(r).toMatch(/^NÃO AGENDADO: terça-feira, 10\/11 às 10:00 já está lotado/);
        expect(r).toContain('(2026-11-10): 09:00, 11:00');
    });

    it('fora do horário de visita (domingo, ou "dia 15" que cai no domingo): não grava', async () => {
        const r = await conferirPedidoDaIa({ tenantId: TENANT, conversationId: conversa._id, input: { quando: 'dia 15 às 14h' } });
        expect(r).toMatch(/domingo, 15\/11 às 14:00 está fora do horário de visita/);
        // O dia pedido não tem vaga: os próximos dias vêm na lista.
        expect(r).toContain('(2026-11-16)');
    });

    it('remarcar para o horário que já é dele não conta como conflito', async () => {
        fakes.agendamentos.reset([
            { tenantId: TENANT, conversationId: conversa._id, inicio: em('2026-11-10', '10:00'), duracaoMin: 60, status: 'confirmado' },
        ]);
        const r = await conferirPedidoDaIa({ tenantId: TENANT, conversationId: conversa._id, input: { data_iso: '2026-11-10T10:00' } });
        expect(r).toBeNull();
    });

    it('sem agenda configurada, a IA agenda o que o cliente pediu', async () => {
        fakes.configs.reset([]);
        const r = await conferirPedidoDaIa({ tenantId: TENANT, conversationId: conversa._id, input: { quando: 'domingo 7h' } });
        expect(r).toBeNull();
    });

    it('remarcar a visita confirmada move a mesma: volta para a confirmar e o lembrete zera', async () => {
        const [antiga] = fakes.agendamentos.reset([
            {
                tenantId: TENANT,
                conversationId: conversa._id,
                contactId: contato._id,
                inicio: em('2026-11-10', '10:00'),
                duracaoMin: 60,
                status: 'confirmado',
                origem: 'equipe',
                confirmadoEm: new Date(),
                lembrete: { em: new Date(), via: 'texto', erro: null },
            },
        ]);
        await agendarPelaIa({
            store,
            conv: conversa as any,
            contact: contato as any,
            telefone: null,
            input: { tipo: 'visita', quando: 'quarta às 15h', data_iso: '2026-11-11T15:00' },
        });
        expect(fakes.agendamentos.docs).toHaveLength(1);
        const a = fakes.agendamentos.byId(antiga._id)!;
        expect(dataLocal(a.inicio)).toBe('2026-11-11');
        expect(horaLocal(a.inicio)).toBe('15:00');
        expect(a.status).toBe('a_confirmar');
        expect(a.confirmadoEm).toBeNull();
        expect(a.lembrete).toEqual({ em: null, via: null, erro: null });
        expect(a.observacao).toMatch(/^Remarcado pela IA; antes: terça-feira, 10\/11 às 10:00 \(confirmado\)/);
        // Quem criou continua sendo quem criou.
        expect(a.origem).toBe('equipe');
    });
});

describe('turno da IA com a ação recusada', () => {
    const vazio = { usage: { inputTokens: 0, outputTokens: 0 } };
    const agendar = { name: 'agendar_visita', input: { tipo: 'visita', quando: 'terça 10h', data_iso: '2026-11-10T10:00', resumo: 'x', mensagem: 'Agendado!' } };
    const turno = (validarAcao?: (c: any) => Promise<string | null>) =>
        runStoreTurn({
            store: { financiamento: null, mapsUrl: null } as any,
            system: 'sistema',
            messages: [{ role: 'user', content: 'terça às 10h' }],
            creds: { provider: 'gemini', apiKey: 'x' },
            opcoes: { fotos: false, agenda: true, horarios: true },
            onConsulta: async () => 'nada',
            validarAcao,
        });

    it('o motivo volta para o modelo, que oferece outro horário em vez de agendar', async () => {
        roteiro.respostas = [
            { ...vazio, text: '', toolCalls: [agendar] },
            { ...vazio, text: 'Terça às 10h já está ocupado. Pode ser às 11h?', toolCalls: [] },
        ];
        const r = await turno(async (c) => (c.name === 'agendar_visita' ? 'NÃO AGENDADO: lotado.' : null));
        expect(r).toEqual({ replyText: 'Terça às 10h já está ocupado. Pode ser às 11h?', acao: null });
        expect(roteiro.chamadas).toHaveLength(2);
        expect(roteiro.chamadas[1].at(-1).content).toContain('Resultado de agendar_visita:\nNÃO AGENDADO: lotado.');
    });

    it('horário que cabe: a ação sai como veio', async () => {
        roteiro.respostas = [{ ...vazio, text: '', toolCalls: [agendar] }];
        const r = await turno(async () => null);
        expect(r.acao?.name).toBe('agendar_visita');
        expect(roteiro.chamadas).toHaveLength(1);
    });
});

describe('tarefa do pedido de foto', () => {
    const pedido = {
        tenantId: TENANT,
        titulo: 'Mandar fotos do Onix para Ana',
        conversationId: String(conversa._id),
        origem: 'ia' as const,
        semRepetir: true,
    };

    it('o mesmo pedido com a tarefa aberta não cria outra; feita a primeira, cria', async () => {
        await criarTarefa(pedido);
        await criarTarefa(pedido);
        expect(fakes.tarefas.docs).toHaveLength(1);
        fakes.tarefas.docs[0].feita = true;
        await criarTarefa(pedido);
        expect(fakes.tarefas.docs).toHaveLength(2);
        // Outro carro é outro pedido.
        await criarTarefa({ ...pedido, titulo: 'Mandar fotos do HB20 para Ana' });
        expect(fakes.tarefas.docs).toHaveLength(3);
    });
});
