// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { GET as listarVeiculos } from '@/app/api/vehicles/route';
import { GET as sugestoes } from '@/app/api/vehicles/suggestions/route';
import { PATCH as alterarVitrine } from '@/app/api/admin/concessionarias/[id]/vitrine/route';
import { buildHomeStockPipeline, mapHomeStockSummary } from '@/lib/utils/homeStock';
import { resumoFavoritos } from '@/lib/services/favoritosService';
import DealerVehiclePrice from '@/models/DealerVehiclePrice';
import Concessionaria from '@/models/Concessionaria';

let srv: MongoMemoryServer;

const VISIVEL = new mongoose.Types.ObjectId();
const OCULTA = new mongoose.Types.ObjectId();
const VAR_A = new mongoose.Types.ObjectId();
const VAR_B = new mongoose.Types.ObjectId();
const PRECO_OCULTO = new mongoose.Types.ObjectId();
const USADO_OCULTO = new mongoose.Types.ObjectId();
const planoEmDia = { status: 'active', expiresAt: new Date(Date.now() + 30 * 86_400_000) };

const ADMIN = { user: { email: 'admin@cnv.com.br', profile: 'administrador', allowedProfiles: ['administrador'] } };
const LOJA_OCULTA = { user: { email: 'loja@oculta.com.br', profile: 'concessionaria', allowedProfiles: ['concessionaria'] } };

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-test' });
    const db = mongoose.connection.db!;

    await db.collection('concessionarias').insertMany([
        { _id: VISIVEL, nome: 'Loja Visível', cidade: 'Belo Horizonte', uf: 'MG', ativo: true, planoRepasse: planoEmDia },
        { _id: OCULTA, nome: 'Loja Oculta', cidade: 'Curitiba', uf: 'PR', ativo: true, planoRepasse: planoEmDia },
    ]);
    await db.collection('users').insertOne({ email: LOJA_OCULTA.user.email, dealershipId: OCULTA });
    await db.collection('vehiclevariations').insertMany([
        { _id: VAR_A, marca: 'VW', modelo: 'NIVUS', anoModelo: 2026, ativo: true },
        { _id: VAR_B, marca: 'FIAT', modelo: 'PULSE', anoModelo: 2026, ativo: true },
    ]);
    const agora = new Date();
    await db.collection('dealervehicleprices').insertMany([
        { concessionariaId: VISIVEL, variationId: VAR_A, ativo: true, preco: 150_000, quantidade: 2, createdAt: agora, updatedAt: agora },
        { _id: PRECO_OCULTO, concessionariaId: OCULTA, variationId: VAR_B, ativo: true, preco: 120_000, quantidade: 5, createdAt: agora, updatedAt: agora },
    ]);
    await db.collection('repassevehicles').insertMany([
        { concessionariaId: VISIVEL, marca: 'TOYOTA', modelo: 'COROLLA', cor: 'Prata', preco: 90_000, status: 'Disponível', ativo: true, lojistaId: null, createdAt: agora, updatedAt: agora },
        { _id: USADO_OCULTO, concessionariaId: OCULTA, marca: 'HONDA', modelo: 'CIVIC', cor: 'Vinho', preco: 80_000, status: 'Disponível', ativo: true, lojistaId: null, createdAt: agora, updatedAt: agora },
    ]);
    await db.collection('favoritoveiculos').insertMany([
        { userEmail: 'cliente@x.com', veiculoId: String(PRECO_OCULTO), origem: 'novo', marca: 'FIAT', modelo: 'PULSE', createdAt: agora, lastSeenAt: agora },
        { userEmail: 'cliente@x.com', veiculoId: String(USADO_OCULTO), origem: 'repasse', marca: 'HONDA', modelo: 'CIVIC', createdAt: agora, lastSeenAt: agora },
    ]);
}, 120_000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv?.stop();
});

const ocultar = async (ocultar: boolean, quem = ADMIN) => {
    session.current = quem;
    return alterarVitrine(
        new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ ocultar }) }),
        { params: Promise.resolve({ id: String(OCULTA) }) },
    );
};

const listar = async (quem = ADMIN) => {
    session.current = quem;
    const res = await listarVeiculos(new Request('http://localhost/api/vehicles?limit=50'));
    expect(res.status).toBe(200);
    return res.json();
};

describe('estoque oculto da vitrine', () => {
    it('só o administrador oculta', async () => {
        const res = await ocultar(true, LOJA_OCULTA);
        expect(res.status).toBe(403);
        expect((await Concessionaria.findById(OCULTA).lean())?.ocultarVitrine).toBeFalsy();
    });

    it('com a loja visível, a vitrine mostra 0KM e repasse dela', async () => {
        const body = await listar();
        expect(body.data.map((v: any) => v.modelo).sort()).toEqual(['CIVIC', 'COROLLA', 'NIVUS', 'PULSE']);
    });

    it('ocultar tira 0KM e repasse da loja da vitrine sem desativar nada', async () => {
        const res = await ocultar(true);
        expect(res.status).toBe(200);
        expect((await res.json()).ocultarVitrine).toBe(true);

        const body = await listar();
        expect(body.data.map((v: any) => v.modelo).sort()).toEqual(['COROLLA', 'NIVUS']);
        expect(body.totalQuantidade).toBe(3);

        const conc = await Concessionaria.findById(OCULTA).lean();
        expect(conc?.ativo).toBe(true);
        expect(conc?.vitrineOcultaPor).toBe('admin@cnv.com.br');
        expect((await DealerVehiclePrice.findById(PRECO_OCULTO).lean())?.ativo).toBe(true);
    });

    it('a própria concessionária continua vendo e atualizando o estoque dela', async () => {
        const body = await listar(LOJA_OCULTA);
        expect(body.data.map((v: any) => v.modelo).sort()).toEqual(['CIVIC', 'PULSE']);
    });

    it('as sugestões de busca não citam a loja nem os usados dela', async () => {
        session.current = ADMIN;
        const res = await sugestoes(new Request('http://localhost/api/vehicles/suggestions?fields=modelo,cidade,concessionaria&limit=50'));
        const { suggestions } = await res.json();
        expect(suggestions.modelo).toContain('COROLLA');
        expect(suggestions.modelo).not.toContain('CIVIC');
        expect(suggestions.cidade).toEqual(['Belo Horizonte']);
        expect(suggestions.concessionaria).toEqual(['Loja Visível']);
    });

    it('a home não conta as unidades da loja oculta', async () => {
        const resumo = mapHomeStockSummary(await DealerVehiclePrice.aggregate(buildHomeStockPipeline()), 2);
        expect(resumo.totalVehicles).toBe(2);
        expect(resumo.totalStates).toBe(1);
    });

    it('favoritos da loja oculta aparecem como indisponíveis', async () => {
        const { veiculos } = await resumoFavoritos('cliente@x.com');
        expect(veiculos.every(v => !v.disponivel)).toBe(true);
    });

    it('reexibir devolve tudo como estava', async () => {
        expect((await ocultar(false)).status).toBe(200);
        const body = await listar();
        expect(body.total).toBe(4);
        const conc = await Concessionaria.findById(OCULTA).lean();
        expect(conc?.ocultarVitrine).toBe(false);
        expect(conc?.vitrineOcultaEm).toBeUndefined();
    });
});
