// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { GET, POST } from '@/app/api/dealership/repasse/route';
import { PATCH, DELETE } from '@/app/api/dealership/repasse/[id]/route';
import { GET as VITRINE } from '@/app/api/vehicles/route';
import { GET as SUGESTOES } from '@/app/api/vehicles/suggestions/route';

let srv: MongoMemoryServer;

const LOJA_A = new mongoose.Types.ObjectId();
const LOJA_B = new mongoose.Types.ObjectId();
const LOJA_SEM_PLANO = new mongoose.Types.ObjectId();
const planoEmDia = () => ({ status: 'active', planName: 'Repasse Mensal', billingType: 'monthly', expiresAt: new Date(Date.now() + 20 * 864e5) });
const VAR_CARRO = new mongoose.Types.ObjectId();
const VAR_MOTO = new mongoose.Types.ObjectId();

const staff = { user: { email: 'admin@cnv.com.br', profile: 'administrador', allowedProfiles: ['administrador'] } };
const donoA = { user: { email: 'loja-a@cnv.com.br', profile: 'concessionaria', allowedProfiles: ['concessionaria'] } };
const donoB = { user: { email: 'loja-b@cnv.com.br', profile: 'concessionaria', allowedProfiles: ['concessionaria'] } };
const donoSemPlano = { user: { email: 'loja-c@cnv.com.br', profile: 'concessionaria', allowedProfiles: ['concessionaria'] } };
const lojista = { user: { email: 'lojista@cnv.com.br', profile: 'cliente', allowedProfiles: ['cliente'] } };

const onix = { marca: 'chevrolet', modelo: 'onix lt 1.0 turbo', ano: '19/20', km: '48.500', preco: '72.900,00', cor: 'prata' };

function req(path: string, init?: RequestInit) {
    return new Request(`http://localhost${path}`, init);
}
function json(method: string, body: unknown): RequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-repasse-test' });
    const db = mongoose.connection.db!;

    await db.collection('concessionarias').insertMany([
        { _id: LOJA_A, nome: 'Loja A Toyota', uf: 'MG', cidade: 'BH', ativo: true, planoRepasse: planoEmDia() },
        { _id: LOJA_B, nome: 'Loja B Fiat', uf: 'SP', cidade: 'SP', ativo: true, planoRepasse: planoEmDia() },
        { _id: LOJA_SEM_PLANO, nome: 'Loja C sem plano', uf: 'RJ', cidade: 'RJ', ativo: true },
    ]);
    await db.collection('users').insertMany([
        { firebaseUid: 'uid-a', email: 'loja-a@cnv.com.br', dealershipId: LOJA_A, allowedProfiles: ['concessionaria'] },
        { firebaseUid: 'uid-b', email: 'loja-b@cnv.com.br', dealershipId: LOJA_B, allowedProfiles: ['concessionaria'] },
        { firebaseUid: 'uid-s', email: 'loja-c@cnv.com.br', dealershipId: LOJA_SEM_PLANO, allowedProfiles: ['concessionaria'] },
        // Assinante em dia: a vitrine bloqueia vencido.
        { firebaseUid: 'uid-c', email: 'lojista@cnv.com.br', allowedProfiles: ['cliente'], subscription: { expiresAt: new Date(Date.now() + 30 * 864e5) } },
    ]);
    await db.collection('vehiclevariations').insertMany([
        { _id: VAR_CARRO, marca: 'TOYOTA', modelo: 'COROLLA XEI', tipoVeiculo: 'carro', anoModelo: 2026, ativo: true },
        { _id: VAR_MOTO, marca: 'HONDA MOTOS', modelo: 'HONDA CG160 TITAN', tipoVeiculo: 'moto', anoModelo: 2026, ativo: true },
    ]);
    await db.collection('dealervehicleprices').insertMany([
        { concessionariaId: LOJA_A, variationId: VAR_CARRO, ativo: true, preco: 180_000, quantidade: 3, createdAt: new Date(), updatedAt: new Date() },
        { concessionariaId: LOJA_A, variationId: VAR_MOTO, ativo: true, preco: 22_000, quantidade: 2, createdAt: new Date(), updatedAt: new Date() },
    ]);
}, 120_000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv?.stop();
});

beforeEach(async () => {
    await mongoose.connection.db!.collection('repassevehicles').deleteMany({});
});

async function criarComoDonoA(body: Record<string, unknown> = onix) {
    session.current = donoA;
    const res = await POST(req('/api/dealership/repasse', json('POST', body)));
    return { res, body: await res.json() };
}

describe('painel da concessionária — /api/dealership/repasse', () => {
    it('concessionária com plano cadastra na própria loja', async () => {
        const { res, body } = await criarComoDonoA();
        expect(res.status).toBe(201);
        expect(body).toMatchObject({ concessionariaId: LOJA_A.toString(), marca: 'CHEVROLET', km: 48500, preco: 72900, status: 'Disponível', ano: '19/20' });
        expect(body).not.toHaveProperty('placa');
    });

    it('sem plano de repasse a loja não cadastra (402)', async () => {
        session.current = donoSemPlano;
        const res = await POST(req('/api/dealership/repasse', json('POST', onix)));
        expect(res.status).toBe(402);
        expect((await res.json()).code).toBe('PLANO_REPASSE_INATIVO');
    });

    it('equipe interna também precisa ativar o plano antes de cadastrar pela loja', async () => {
        session.current = staff;
        const res = await POST(req(`/api/dealership/repasse?concessionariaId=${LOJA_SEM_PLANO}`, json('POST', onix)));
        expect(res.status).toBe(402);
    });

    it('lista devolve a situação do plano', async () => {
        session.current = donoA;
        const body = await (await GET(req('/api/dealership/repasse'))).json();
        expect(body.plano).toMatchObject({ ativo: true, planName: 'Repasse Mensal' });
    });

    it('recusa cadastro sem km com mensagem legível', async () => {
        const { res, body } = await criarComoDonoA({ ...onix, km: '' });
        expect(res.status).toBe(400);
        expect(body.error).toContain('Quilometragem é obrigatória.');
    });

    it('dois carros iguais com km diferente convivem', async () => {
        expect((await criarComoDonoA()).res.status).toBe(201);
        expect((await criarComoDonoA({ ...onix, km: '61.000' })).res.status).toBe(201);
    });

    it('lista só a própria loja, com contagem por status', async () => {
        await criarComoDonoA();
        await criarComoDonoA({ ...onix, status: 'Reservado' });
        session.current = donoB;
        await POST(req('/api/dealership/repasse', json('POST', onix)));

        session.current = donoA;
        const body = await (await GET(req('/api/dealership/repasse'))).json();
        expect(body.total).toBe(2);
        expect(body.contagem).toEqual({ 'Disponível': 1, 'Reservado': 1, 'Vendido': 0 });
    });

    it('concessionária ignora concessionariaId da query e não enxerga outra loja', async () => {
        await criarComoDonoA();
        session.current = donoB;
        const body = await (await GET(req(`/api/dealership/repasse?concessionariaId=${LOJA_A}`))).json();
        expect(body.total).toBe(0);
    });

    it('outra concessionária não edita nem exclui (404)', async () => {
        const { body } = await criarComoDonoA();
        session.current = donoB;
        expect((await PATCH(req(`/api/dealership/repasse/${body.id}`, json('PATCH', { preco: '1' })), params(body.id))).status).toBe(404);
        expect((await DELETE(req(`/api/dealership/repasse/${body.id}`, { method: 'DELETE' }), params(body.id))).status).toBe(404);
    });

    it('equipe interna cadastra e edita em nome de qualquer loja', async () => {
        session.current = staff;
        const res = await POST(req(`/api/dealership/repasse?concessionariaId=${LOJA_B}`, json('POST', onix)));
        expect(res.status).toBe(201);
        const criado = await res.json();
        expect(criado.concessionariaId).toBe(LOJA_B.toString());

        const edit = await PATCH(req(`/api/dealership/repasse/${criado.id}`, json('PATCH', { km: '50000' })), params(criado.id));
        expect((await edit.json()).km).toBe(50000);
    });

    it('lojista não acessa o painel', async () => {
        session.current = lojista;
        expect((await GET(req('/api/dealership/repasse'))).status).toBe(403);
    });

    it('excluir é lógico: some da lista', async () => {
        const { body } = await criarComoDonoA();
        session.current = donoA;
        expect((await DELETE(req(`/api/dealership/repasse/${body.id}`, { method: 'DELETE' }), params(body.id))).status).toBe(200);
        expect((await (await GET(req('/api/dealership/repasse'))).json()).total).toBe(0);
        const noBanco = await mongoose.connection.db!.collection('repassevehicles').findOne({ _id: new mongoose.Types.ObjectId(body.id) });
        expect(noBanco?.ativo).toBe(false);
    });
});

describe('vitrine — segmentos com repasse', () => {
    const vitrine = async (query: string) => {
        session.current = lojista;
        const res = await VITRINE(req(`/api/vehicles?limit=50&accessProfile=cliente&${query}`));
        expect(res.status).toBe(200);
        return res.json();
    };

    beforeEach(async () => {
        await criarComoDonoA();
        await criarComoDonoA({ ...onix, modelo: 'CG 160 FAN', marca: 'HONDA', tipoVeiculo: 'moto', km: '12000', status: 'Reservado' });
        await criarComoDonoA({ ...onix, modelo: 'HB20 VENDIDO', marca: 'HYUNDAI', status: 'Vendido' });
    });

    it('Repasse mostra só usados visíveis, com km', async () => {
        const body = await vitrine('tipo=repasse');
        expect(body.total).toBe(2);
        for (const v of body.data) {
            expect(v.origem).toBe('repasse');
            expect(v.variationId).toBeUndefined();
            expect(v.concessionaria).toBe('Loja A Toyota');
            expect(v.quantidade).toBe(1);
        }
        expect(body.data.map((v: any) => v.km).sort()).toEqual([12000, 48500]);
        expect(body.data.find((v: any) => v.modelo === 'HB20 VENDIDO')).toBeUndefined();
    });

    it('Todos junta 0KM e repasse na mesma lista e soma as unidades', async () => {
        const body = await vitrine('tipo=todos');
        expect(body.total).toBe(4);
        expect(body.totalQuantidade).toBe(3 + 2 + 1 + 1);
        expect(new Set(body.data.map((v: any) => v.origem))).toEqual(new Set(['novo', 'repasse']));
        expect(body.data.find((v: any) => v.origem === 'novo').km).toBe(0);
    });

    it('Carros 0KM e Motos 0KM não trazem usado', async () => {
        const carros = await vitrine('tipo=carro');
        expect(carros.data.map((v: any) => v.modelo)).toEqual(['COROLLA XEI']);
        const motos = await vitrine('tipo=moto');
        expect(motos.data.map((v: any) => v.modelo)).toEqual(['HONDA CG160 TITAN']);
    });

    it('plano vencido tira os anúncios da vitrine sem apagar; renovado, voltam', async () => {
        const db = mongoose.connection.db!;
        await db.collection('concessionarias').updateOne({ _id: LOJA_A }, { $set: { 'planoRepasse.expiresAt': new Date(Date.now() - 864e5) } });
        try {
            expect((await vitrine('tipo=repasse')).total).toBe(0);
            expect((await vitrine('tipo=todos')).total).toBe(2);
            session.current = donoA;
            expect((await (await GET(req('/api/dealership/repasse'))).json()).total).toBe(3);
        } finally {
            await db.collection('concessionarias').updateOne({ _id: LOJA_A }, { $set: { planoRepasse: planoEmDia() } });
        }
        expect((await vitrine('tipo=repasse')).total).toBe(2);
    });

    it('plano cancelado pelo admin também tira da vitrine', async () => {
        const db = mongoose.connection.db!;
        await db.collection('concessionarias').updateOne({ _id: LOJA_A }, { $set: { 'planoRepasse.status': 'cancelled' } });
        try {
            expect((await vitrine('tipo=repasse')).total).toBe(0);
        } finally {
            await db.collection('concessionarias').updateOne({ _id: LOJA_A }, { $set: { planoRepasse: planoEmDia() } });
        }
    });

    it('busca e filtro de status valem para o usado', async () => {
        expect((await vitrine('search=onix')).data.map((v: any) => v.modelo)).toEqual(['ONIX LT 1.0 TURBO']);
        expect((await vitrine('tipo=repasse&status=Reservado')).data.map((v: any) => v.modelo)).toEqual(['CG 160 FAN']);
    });

    it('concessionária na vitrine vê o próprio repasse, não o de outra loja', async () => {
        session.current = donoB;
        await POST(req('/api/dealership/repasse', json('POST', { ...onix, modelo: 'ARGO DA LOJA B' })));
        const res = await VITRINE(req('/api/vehicles?limit=50&tipo=repasse&accessProfile=concessionaria'));
        const body = await res.json();
        expect(body.data.map((v: any) => v.modelo)).toEqual(['ARGO DA LOJA B']);
    });
});

describe('sidebar — sugestões de modelo por segmento', () => {
    const modelos = async (tipo: string) => {
        session.current = lojista;
        const res = await SUGESTOES(req(`/api/vehicles/suggestions?fields=modelo&limit=1000&accessProfile=cliente&tipo=${tipo}`));
        return (await res.json()).suggestions.modelo as string[];
    };

    beforeEach(async () => {
        await criarComoDonoA();
    });

    it('Motos 0KM lista só modelos de moto (regressão)', async () => {
        expect(await modelos('moto')).toEqual(['HONDA CG160 TITAN']);
    });

    it('Repasse lista só modelos dos usados', async () => {
        expect(await modelos('repasse')).toEqual(['ONIX LT 1.0 TURBO']);
    });

    it('modelo de loja com plano vencido some da sidebar', async () => {
        const db = mongoose.connection.db!;
        await db.collection('concessionarias').updateOne({ _id: LOJA_A }, { $set: { 'planoRepasse.expiresAt': new Date(Date.now() - 864e5) } });
        try {
            expect(await modelos('repasse')).toEqual([]);
        } finally {
            await db.collection('concessionarias').updateOne({ _id: LOJA_A }, { $set: { planoRepasse: planoEmDia() } });
        }
    });

    it('Todos lista catálogo 0KM e usados', async () => {
        expect((await modelos('todos')).sort()).toEqual(['COROLLA XEI', 'HONDA CG160 TITAN', 'ONIX LT 1.0 TURBO']);
    });
});
