// @vitest-environment node
// Evento para a Meta na coluna do funil (wa/lib/funil.ts): o servidor só
// aceita os nomes da Meta (ou nenhum), a coluna nova sem escolha fica sem o
// campo (segue o tipo) e as colunas de fábrica já nascem com o evento.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const estado = vi.hoisted(() => ({ docs: [] as any[] }));

vi.mock('@/lib/mongodb', () => ({ default: async () => null }));
vi.mock('@wa/models/funil', () => {
    // Consulta encadeável mínima: o que colunasDo, criarColuna e editarColuna usam.
    const consulta = (resultado: () => unknown) => {
        const q: any = {
            sort: () => q,
            select: () => q,
            lean: () => q,
            then: (ok: any, erro: any) => Promise.resolve().then(resultado).then(ok, erro),
        };
        return q;
    };
    const doDono = (f: any) => estado.docs.filter((d) => d.tenantId === f.tenantId);
    return {
        WaFunilColuna: {
            find: (f: any) => consulta(() => doDono(f).map((d) => ({ ...d }))),
            findOne: (f: any) =>
                consulta(() => {
                    const d = doDono(f).find((x) => !f._id || String(x._id) === String(f._id));
                    return d ? Object.assign(d, { save: async () => d }) : null;
                }),
            create: async (doc: any) => {
                if (doc.name === undefined) throw new Error('sem nome');
                const d = { _id: new mongoose.Types.ObjectId(), ...doc };
                estado.docs.push(d);
                return { ...d, toObject: () => ({ ...d }) };
            },
        },
    };
});

import { FunilError, colunasDo, criarColuna, editarColuna } from '@wa/lib/funil';

const LOJA = 'loja-1';

beforeEach(() => {
    estado.docs = [];
});

describe('evento da Meta na coluna', () => {
    it('as colunas de fábrica nascem com Purchase no Vendido e QualifiedLead na visita', async () => {
        const colunas = await colunasDo(LOJA);
        expect(colunas.find((c) => c.systemKey === 'ganho')?.eventoMeta).toBe('Purchase');
        expect(colunas.find((c) => c.systemKey === 'cadastro')?.eventoMeta).toBe('QualifiedLead');
        expect(colunas.find((c) => c.systemKey === 'conversa')?.eventoMeta).toBeNull();
    });

    it('coluna nova: com evento grava; sem escolha fica sem o campo', async () => {
        const quente = await criarColuna(LOJA, { name: 'Lead quente', type: 'open', eventoMeta: 'LeadSubmitted' });
        expect(quente.eventoMeta).toBe('LeadSubmitted');
        const outra = await criarColuna(LOJA, { name: 'Vendido na troca', type: 'won' });
        expect('eventoMeta' in outra).toBe(false);
        expect(estado.docs.find((d) => d.name === 'Vendido na troca')).not.toHaveProperty('eventoMeta');
        const nenhum = await criarColuna(LOJA, { name: 'Sem evento', type: 'won', eventoMeta: null });
        expect(nenhum.eventoMeta).toBeNull();
    });

    it('nome fora da lista da Meta é recusado', async () => {
        await expect(criarColuna(LOJA, { name: 'X', eventoMeta: 'Venda' })).rejects.toBeInstanceOf(FunilError);
        await expect(criarColuna(LOJA, { name: 'X', eventoMeta: 'Venda' })).rejects.toThrow('Evento da Meta inválido.');
    });

    it('editar troca, limpa (vazio = nenhum) e recusa o inválido', async () => {
        await colunasDo(LOJA);
        const proposta = estado.docs.find((d) => d.systemKey === 'pagamento');
        const id = String(proposta._id);
        await editarColuna(LOJA, id, { eventoMeta: 'InitiateCheckout' });
        expect(proposta.eventoMeta).toBe('InitiateCheckout');
        await editarColuna(LOJA, id, { eventoMeta: '' });
        expect(proposta.eventoMeta).toBeNull();
        await expect(editarColuna(LOJA, id, { eventoMeta: 'purchase' })).rejects.toThrow('Evento da Meta inválido.');
        // Sem o campo no pedido, não mexe.
        proposta.eventoMeta = 'QualifiedLead';
        await editarColuna(LOJA, id, { name: 'Proposta enviada' });
        expect(proposta.eventoMeta).toBe('QualifiedLead');
    });

    it('a coluna de outra loja não é editada', async () => {
        await colunasDo('outra');
        const alheia = estado.docs.find((d) => d.systemKey === 'ganho');
        await expect(editarColuna(LOJA, String(alheia._id), { eventoMeta: null })).rejects.toThrow('Coluna não encontrada.');
        expect(alheia.eventoMeta).toBe('Purchase');
    });
});
