// @vitest-environment node
// Ações em lote na Central (POST /api/wa/conversations/lote): depois de
// transferir, encerrar ou devolver, cada conversa passa pela fila da equipe
// (wa/lib/fila.ts aposAcaoDaEquipe), como no botão da conversa sozinha. É o
// que avisa quem recebeu a transferência. Coleções falsas em memória.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
const espioes = vi.hoisted(() => ({ fila: [] as Array<{ id: string; por: string }> }));
const LOJA = 'loja-1';

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
vi.mock('@wa/lib/scope', () => ({
    requireScope: async () => ({ tenantId: LOJA, email: 'ana@loja.com', name: 'Ana', role: 'operador', store: {} }),
    scopeError: () => ({ error: 'x', status: 401 }),
    tenantFilter: (s: { tenantId: string | null }) => ({ tenantId: s.tenantId }),
}));
vi.mock('@wa/models/wa', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.conversations = new FakeModel();
    fakes.messages = new FakeModel();
    fakes.jobs = new FakeModel();
    return { WaConversation: fakes.conversations, WaMessage: fakes.messages, WaAiJob: fakes.jobs };
});
vi.mock('@wa/models/central', () => ({ WaEtiqueta: { findOne: () => ({ select: () => ({ lean: async () => ({ _id: 'e1' }) }) }) } }));
vi.mock('@wa/models/atendimento', () => ({ WaNote: { insertMany: async () => [] } }));
vi.mock('@wa/lib/webhooks', () => ({ emitEvent: async () => undefined }));
vi.mock('@wa/lib/central', () => ({
    equipeDoEscopo: async () => [
        { email: 'ana@loja.com', name: 'Ana', role: 'atendente' },
        { email: 'bia@loja.com', name: 'Bia', role: 'atendente' },
    ],
    iaDaConversa: async () => ({ disponivel: true, motivo: null }),
    nomeDe: (m: { email: string; name?: string | null } | null) => m?.name ?? m?.email ?? 'alguém',
}));
vi.mock('@wa/lib/fila', () => ({
    aposAcaoDaEquipe: async (id: string, por: string) => {
        espioes.fila.push({ id, por });
    },
}));

import { POST } from '@/app/api/wa/conversations/lote/route';

function pedir(body: Record<string, unknown>) {
    return POST(
        new NextRequest('http://teste/api/wa/conversations/lote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
    );
}

let ids: string[] = [];
beforeEach(() => {
    espioes.fila.length = 0;
    const docs = fakes.conversations.reset([
        { tenantId: LOJA, status: 'human_active', assignedTo: 'ana@loja.com' },
        { tenantId: LOJA, status: 'waiting_human', assignedTo: null },
        // De outra loja: ignorada.
        { tenantId: 'outra', status: 'waiting_human', assignedTo: null },
    ]);
    ids = docs.map((d: { _id: mongoose.Types.ObjectId }) => String(d._id));
    fakes.messages.reset([]);
    fakes.jobs.reset([]);
});

describe('lote', () => {
    it('transferir para um colega passa cada conversa da loja pela fila (o aviso sai de lá)', async () => {
        const r = await pedir({ ids, acao: 'atribuir', email: 'bia@loja.com' });
        expect(r.status).toBe(200);
        expect(fakes.conversations.byId(ids[0]).assignedTo).toBe('bia@loja.com');
        expect(espioes.fila).toEqual([
            { id: ids[0], por: 'ana@loja.com' },
            { id: ids[1], por: 'ana@loja.com' },
        ]);
    });

    it('encerrar e devolver também; etiqueta não mexe na fila', async () => {
        await pedir({ ids, acao: 'encerrar' });
        expect(espioes.fila).toHaveLength(2);
        espioes.fila.length = 0;
        await pedir({ ids, acao: 'devolver' });
        expect(espioes.fila).toHaveLength(2);
        espioes.fila.length = 0;
        // O fake não tem $addToSet: a etiqueta em si não é o que se confere aqui.
        const original = fakes.conversations.updateMany;
        fakes.conversations.updateMany = async () => ({ matchedCount: 2, modifiedCount: 2 });
        await pedir({ ids, acao: 'etiqueta', etiquetaId: new mongoose.Types.ObjectId().toHexString() });
        fakes.conversations.updateMany = original;
        expect(espioes.fila).toHaveLength(0);
    });
});
