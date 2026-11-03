// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { buscarEstoque } from '@wa/lib/estoque';

let srv: MongoMemoryServer;

const VISIVEL = new mongoose.Types.ObjectId();
const OCULTA = new mongoose.Types.ObjectId();
const LOJISTA = new mongoose.Types.ObjectId();
const planoEmDia = { status: 'active', expiresAt: new Date(Date.now() + 30 * 86_400_000) };

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-test' });
    const db = mongoose.connection.db!;
    const [varA, varB] = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];

    await db.collection('concessionarias').insertMany([
        { _id: VISIVEL, nome: 'Loja Visível', ativo: true, planoRepasse: planoEmDia },
        { _id: OCULTA, nome: 'Loja Oculta', ativo: true, ocultarVitrine: true, planoRepasse: planoEmDia },
    ]);
    await db.collection('users').insertOne({
        _id: LOJISTA,
        email: 'lojista@x.com',
        subscription: { status: 'active', expiresAt: new Date(Date.now() + 30 * 86_400_000) },
    });
    await db.collection('vehiclevariations').insertMany([
        { _id: varA, marca: 'VW', modelo: 'NIVUS', anoModelo: 2026, ativo: true },
        { _id: varB, marca: 'FIAT', modelo: 'PULSE', anoModelo: 2026, ativo: true },
    ]);
    await db.collection('dealervehicleprices').insertMany([
        { concessionariaId: VISIVEL, variationId: varA, ativo: true, preco: 150_000, quantidade: 1 },
        { concessionariaId: OCULTA, variationId: varB, ativo: true, preco: 120_000, quantidade: 1 },
    ]);
    await db.collection('repassevehicles').insertMany([
        { concessionariaId: VISIVEL, marca: 'TOYOTA', modelo: 'COROLLA', preco: 90_000, status: 'Disponível', ativo: true, lojistaId: null },
        { concessionariaId: OCULTA, marca: 'HONDA', modelo: 'CIVIC', preco: 80_000, status: 'Disponível', ativo: true, lojistaId: null },
    ]);
}, 120_000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv?.stop();
});

const titulos = (r: { ofertas: { titulo: string }[] }) => r.ofertas.map(o => o.titulo).sort();

describe('IA da loja e concessionária oculta', () => {
    it('o lojista que revende a rede não oferece carro de loja oculta', async () => {
        const r = await buscarEstoque({ kind: 'lojista', ownerUserId: LOJISTA, ai: { vendeEstoqueCnv: true } } as any, {});
        expect(titulos(r)).toEqual(['TOYOTA COROLLA', 'VW NIVUS']);
    });

    it('a IA da própria concessionária oculta continua vendendo o estoque dela', async () => {
        const r = await buscarEstoque({ kind: 'concessionaria', concessionariaId: OCULTA } as any, {});
        expect(titulos(r)).toEqual(['FIAT PULSE', 'HONDA CIVIC']);
    });
});
