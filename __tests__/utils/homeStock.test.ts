// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { buildHomeStockPipeline, mapHomeStockSummary } from '@/lib/utils/homeStock';

let srv: MongoMemoryServer;

const CONC_MG = new mongoose.Types.ObjectId();
const CONC_SP = new mongoose.Types.ObjectId();
const CONC_APAGADA = new mongoose.Types.ObjectId();

const VAR_FASTBACK_A = new mongoose.Types.ObjectId();
const VAR_FASTBACK_B = new mongoose.Types.ObjectId();
const VAR_TAOS = new mongoose.Types.ObjectId();
const VAR_INATIVA = new mongoose.Types.ObjectId();
const VAR_APAGADA = new mongoose.Types.ObjectId();

const preco = (over: Record<string, unknown>) => ({
    ativo: true,
    preco: 100_000,
    quantidade: 1,
    ...over,
});

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-test' });
    const db = mongoose.connection.db!;

    await db.collection('concessionarias').insertMany([
        { _id: CONC_MG, nome: 'CNV MG', uf: 'mg' },
        { _id: CONC_SP, nome: 'CNV SP', uf: 'SP' },
    ]);

    await db.collection('vehiclevariations').insertMany([
        { _id: VAR_FASTBACK_A, modelo: 'FASTBACK T200 AUT.', ativo: true },
        { _id: VAR_FASTBACK_B, modelo: 'FASTBACK T200 AUT.', ativo: true },
        { _id: VAR_TAOS, modelo: 'TAOS HIGHLINE AUT.', ativo: true },
        { _id: VAR_INATIVA, modelo: 'MODELO DESCONTINUADO', ativo: false },
    ]);

    await db.collection('dealervehicleprices').insertMany([
        // FASTBACK: 2 unidades em MG + 5 em SP -> 7 unidades, UF exibida = SP
        preco({ variationId: VAR_FASTBACK_A, concessionariaId: CONC_MG, quantidade: 2, preco: 120_000 }),
        preco({ variationId: VAR_FASTBACK_B, concessionariaId: CONC_SP, quantidade: 5, preco: 110_000 }),
        // TAOS: 3 unidades, precificado por duas concessionárias na MESMA variação
        preco({ variationId: VAR_TAOS, concessionariaId: CONC_MG, quantidade: 1, preco: 200_000 }),
        preco({ variationId: VAR_TAOS, concessionariaId: CONC_SP, quantidade: 2, preco: 220_000 }),

        // Nada abaixo deve entrar na conta:
        preco({ variationId: VAR_FASTBACK_A, concessionariaId: CONC_APAGADA, quantidade: 9 }), // concessionária removida
        preco({ variationId: VAR_INATIVA, concessionariaId: CONC_MG, quantidade: 9 }),         // variação inativa
        preco({ variationId: VAR_APAGADA, concessionariaId: CONC_MG, quantidade: 9 }),         // variação inexistente
        preco({ variationId: VAR_TAOS, concessionariaId: CONC_MG, quantidade: 9, ativo: false }), // inativo
        preco({ variationId: VAR_TAOS, concessionariaId: CONC_SP, quantidade: 9, preco: 0 }),  // sem preço
    ]);
}, 120_000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv?.stop();
});

const rodar = async (variacoesAtivas = 4) => {
    const resultado = await mongoose.connection.db!
        .collection('dealervehicleprices')
        .aggregate(buildHomeStockPipeline())
        .toArray();
    return mapHomeStockSummary(resultado, variacoesAtivas);
};

describe('painel de estoque da home', () => {
    it('conta apenas unidades de anúncios válidos', async () => {
        const resumo = await rodar();
        // 2 + 5 + 1 + 2 = 10 (órfãos, inativos e sem preço ficam de fora)
        expect(resumo.totalVehicles).toBe(10);
    });

    it('soma o valor do estoque como preço x quantidade', async () => {
        const resumo = await rodar();
        // 120k*2 + 110k*5 + 200k*1 + 220k*2 = 1.430.000
        expect(resumo.totalValue).toBe(1_430_000);
    });

    it('conta estados distintos ignorando maiúsculas/minúsculas', async () => {
        const resumo = await rodar();
        expect(resumo.totalStates).toBe(2);
    });

    it('usa variações distintas no percentual, não anúncios', async () => {
        // 3 variações precificadas (FASTBACK A, FASTBACK B, TAOS) de 4 ativas.
        // O TAOS aparece em 2 anúncios e não pode ser contado duas vezes.
        const resumo = await rodar(4);
        expect(resumo.pricedPct).toBe(75);
    });

    it('nunca passa de 100% mesmo com catálogo menor que os anúncios', async () => {
        const resumo = await rodar(1);
        expect(resumo.pricedPct).toBe(100);
    });

    it('ranqueia modelos por unidades e mostra a UF com mais estoque', async () => {
        const resumo = await rodar();
        expect(resumo.topModels).toHaveLength(2);

        const [fastback, taos] = resumo.topModels;
        expect(fastback.name).toBe('FASTBACK T200 AUT.');
        expect(fastback.count).toBe(7);
        expect(fastback.estado).toBe('SP'); // 5 unidades em SP contra 2 em MG
        expect(fastback.avgPrice).toBe(115_000); // média dos 2 anúncios

        expect(taos.name).toBe('TAOS HIGHLINE AUT.');
        expect(taos.count).toBe(3);
        expect(taos.estado).toBe('SP');
    });

    it('devolve zeros quando não há resultado', () => {
        expect(mapHomeStockSummary([], 100)).toEqual({
            totalVehicles: 0,
            totalValue: 0,
            totalStates: 0,
            pricedPct: 0,
            topModels: [],
        });
    });
});
