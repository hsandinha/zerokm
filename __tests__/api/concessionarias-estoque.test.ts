// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { GET } from '@/app/api/concessionarias/route';

let srv: MongoMemoryServer;

const CONC_ATIVA = new mongoose.Types.ObjectId();
const CONC_ZERADA = new mongoose.Types.ObjectId();
const CONC_SEM_PRECO = new mongoose.Types.ObjectId();

const VAR_ATIVA = new mongoose.Types.ObjectId();
const VAR_ATIVA_2 = new mongoose.Types.ObjectId();
const VAR_INATIVA = new mongoose.Types.ObjectId();

const ONTEM = new Date('2026-07-28T12:00:00.000Z');
const SEMANA_PASSADA = new Date('2026-07-22T12:00:00.000Z');
const ANTIGO = new Date('2026-05-01T12:00:00.000Z');

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-test' });
    const db = mongoose.connection.db!;

    await db.collection('concessionarias').insertMany([
        { _id: CONC_ATIVA, nome: 'CNV Ativa', ativo: true },
        // Nome divergente de propósito: a contagem antiga casava por nome e
        // zerava esta linha; agora é por concessionariaId.
        { _id: CONC_ZERADA, nome: 'CNV Zerada - OPERADOR.X', ativo: true },
        { _id: CONC_SEM_PRECO, nome: 'CNV Sem Preço', ativo: true },
    ]);

    await db.collection('vehiclevariations').insertMany([
        { _id: VAR_ATIVA, modelo: 'MODELO ATIVO', ativo: true },
        { _id: VAR_ATIVA_2, modelo: 'OUTRO MODELO ATIVO', ativo: true },
        { _id: VAR_INATIVA, modelo: 'MODELO REMOVIDO', ativo: false },
    ]);

    // O índice único (variationId, concessionariaId) permite um preço por
    // variação em cada loja, então cada linha usa uma variação diferente.
    await db.collection('dealervehicleprices').insertMany([
        // Ativa: 3 + 2 unidades válidas
        { concessionariaId: CONC_ATIVA, variationId: VAR_ATIVA, ativo: true, preco: 100_000, quantidade: 3, updatedAt: SEMANA_PASSADA },
        { concessionariaId: CONC_ATIVA, variationId: VAR_ATIVA_2, ativo: true, preco: 90_000, quantidade: 2, updatedAt: ONTEM },
        // Não conta: variação fora do catálogo mestre
        { concessionariaId: CONC_ATIVA, variationId: VAR_INATIVA, ativo: true, preco: 80_000, quantidade: 7, updatedAt: ANTIGO },
        // Zerada: mexeu ontem para zerar o estoque -> 0 unidades, mas ATIVIDADE recente
        { concessionariaId: CONC_ZERADA, variationId: VAR_ATIVA, ativo: false, preco: null, quantidade: 0, updatedAt: ONTEM },
    ]);
}, 120_000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv?.stop();
});

const listar = async () => {
    session.current = { user: { email: 'admin@cnv.com.br', profile: 'administrador' } };
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    return new Map(body.map((c: any) => [c.nome, c]));
};

describe('GET /api/concessionarias — estoque por concessionariaId', () => {
    it('conta unidades apenas de preços ativos com variação ativa', async () => {
        const porNome = await listar();
        expect((porNome.get('CNV Ativa') as any).totalVeiculos).toBe(5);
        expect((porNome.get('CNV Ativa') as any).totalAtivos).toBe(5);
    });

    it('usa a data do preço mais recente como última atualização', async () => {
        const porNome = await listar();
        expect(new Date((porNome.get('CNV Ativa') as any).ultimaAtualizacao).toISOString())
            .toBe(ONTEM.toISOString());
    });

    it('mantém a atividade recente de quem zerou o estoque', async () => {
        const porNome = await listar();
        const zerada = porNome.get('CNV Zerada - OPERADOR.X') as any;
        // Estoque zero, mas o semáforo não pode ficar vermelho: ela mexeu ontem.
        expect(zerada.totalVeiculos).toBe(0);
        expect(new Date(zerada.ultimaAtualizacao).toISOString()).toBe(ONTEM.toISOString());
    });

    it('devolve zero e sem data para concessionária que nunca precificou', async () => {
        const porNome = await listar();
        const semPreco = porNome.get('CNV Sem Preço') as any;
        expect(semPreco.totalVeiculos).toBe(0);
        expect(semPreco.ultimaAtualizacao).toBeNull();
    });
});
