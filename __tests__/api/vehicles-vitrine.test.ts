// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { GET } from '@/app/api/vehicles/route';

let srv: MongoMemoryServer;

const CONC = new mongoose.Types.ObjectId();
const VAR_ATIVA = new mongoose.Types.ObjectId();
const VAR_ATIVA_2 = new mongoose.Types.ObjectId();
const VAR_INATIVA = new mongoose.Types.ObjectId();
const VAR_APAGADA = new mongoose.Types.ObjectId();

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-test' });
    const db = mongoose.connection.db!;

    await db.collection('concessionarias').insertOne({ _id: CONC, nome: 'CNV Teste', uf: 'MG', ativo: true });

    await db.collection('vehiclevariations').insertMany([
        { _id: VAR_ATIVA, marca: 'VW', modelo: 'NIVUS HIGHLINE AUT.', anoModelo: 2026, ativo: true },
        { _id: VAR_ATIVA_2, marca: 'VW', modelo: 'POLO TRACK', anoModelo: 2026, ativo: true },
        { _id: VAR_INATIVA, marca: 'VW', modelo: 'MODELO FORA DE LINHA', anoModelo: 2026, ativo: false },
    ]);

    await db.collection('dealervehicleprices').insertMany([
        { concessionariaId: CONC, variationId: VAR_ATIVA, ativo: true, preco: 150_000, quantidade: 4, createdAt: new Date(), updatedAt: new Date() },
        // Preso: preço ativo em variação inativa. Some da vitrine, mas segue no banco.
        { concessionariaId: CONC, variationId: VAR_INATIVA, ativo: true, preco: 130_000, quantidade: 9, createdAt: new Date(), updatedAt: new Date() },
        // Variação apagada: já era descartado pelo $unwind.
        { concessionariaId: CONC, variationId: VAR_APAGADA, ativo: true, preco: 120_000, quantidade: 5, createdAt: new Date(), updatedAt: new Date() },
        // Preço inativo (índice único não deixa repetir a variação na mesma loja).
        { concessionariaId: CONC, variationId: VAR_ATIVA_2, ativo: false, preco: null, quantidade: 0, createdAt: new Date(), updatedAt: new Date() },
    ]);
}, 120_000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv?.stop();
});

const listar = async () => {
    session.current = { user: { email: 'admin@cnv.com.br', profile: 'administrador', allowedProfiles: ['administrador'] } };
    const res = await GET(new Request('http://localhost/api/vehicles?limit=50'));
    expect(res.status).toBe(200);
    return res.json();
};

describe('GET /api/vehicles — vitrine', () => {
    it('lista apenas anúncios com variação ativa', async () => {
        const body = await listar();
        expect(body.total).toBe(1);
        expect(body.data).toHaveLength(1);
        expect(body.data[0].modelo).toBe('NIVUS HIGHLINE AUT.');
    });

    it('não conta as unidades presas em variação inativa', async () => {
        const body = await listar();
        // 4 do anúncio válido; as 9 da variação inativa e as 5 da apagada ficam fora.
        expect(body.totalQuantidade).toBe(4);
    });

    it('não devolve o modelo fora de linha em nenhum registro', async () => {
        const body = await listar();
        const modelos = body.data.map((v: any) => v.modelo);
        expect(modelos).not.toContain('MODELO FORA DE LINHA');
    });
});
