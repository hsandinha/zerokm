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
import { GET as MODELOS } from '@/app/api/catalog/modelos/route';

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

// O modelo tem que existir no catálogo mestre: o cadastro só aceita texto
// livre com a marcação explícita de "fora do catálogo".
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
        // Usados do teste precisam existir no catálogo para passar na validação.
        { marca: 'CHEVROLET', modelo: 'ONIX LT 1.0 TURBO', tipoVeiculo: 'carro', anoModelo: 2026, ativo: true },
        { marca: 'HONDA MOTOS', modelo: 'CG 160 FAN', tipoVeiculo: 'moto', anoModelo: 2026, ativo: true },
        { marca: 'HYUNDAI', modelo: 'HB20 VENDIDO', tipoVeiculo: 'carro', anoModelo: 2026, ativo: true },
        { marca: 'FIAT', modelo: 'ARGO DA LOJA B', tipoVeiculo: 'carro', anoModelo: 2026, ativo: true },
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
        await criarComoDonoA({ ...onix, km: '61.000' });
        session.current = donoB;
        await POST(req('/api/dealership/repasse', json('POST', onix)));

        session.current = donoA;
        const body = await (await GET(req('/api/dealership/repasse'))).json();
        expect(body.total).toBe(2);
        expect(body.contagem).toEqual({ 'Disponível': 2 });
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

    it('repasse só aceita o estado Disponível: vendido sai por remoção', async () => {
        const { res, body } = await criarComoDonoA({ ...onix, status: 'Vendido' });
        expect(res.status).toBe(400);
        expect(body.error).toMatch(/remova o anúncio/);
    });

    it('modelo fora do catálogo é recusado', async () => {
        const { res, body } = await criarComoDonoA({ ...onix, modelo: 'onix lt turbinado do zé' });
        expect(res.status).toBe(400);
        expect(body.code).toBe('MODELO_FORA_DO_CATALOGO');
    });

    it('modelo escolhido na FIPE passa com o código FIPE, mesmo fora do catálogo', async () => {
        const { res, body } = await criarComoDonoA({ ...onix, modelo: 'Onix Hatch LT 1.0 12V Flex 5p Mec.', codigoFipe: '0040996', descricaoFipe: 'Onix Hatch LT 1.0 12V Flex 5p Mec.' });
        expect(res.status).toBe(201);
        expect(body).toMatchObject({ codigoFipe: '004099-6', descricaoFipe: 'Onix Hatch LT 1.0 12V Flex 5p Mec.', foraDoCatalogo: false });
    });

    it('código FIPE fora do formato é recusado', async () => {
        const { res } = await criarComoDonoA({ ...onix, modelo: 'qualquer', codigoFipe: '12-3' });
        expect(res.status).toBe(400);
    });

    it('modelo antigo passa quando marcado como fora do catálogo', async () => {
        const { res, body } = await criarComoDonoA({ ...onix, modelo: 'gol g4 1.0', foraDoCatalogo: true });
        expect(res.status).toBe(201);
        expect(body).toMatchObject({ modelo: 'GOL G4 1.0', foraDoCatalogo: true });
    });

    it('trocar o modelo na edição segue a mesma regra', async () => {
        const { body } = await criarComoDonoA();
        session.current = donoA;
        const ruim = await PATCH(req(`/api/dealership/repasse/${body.id}`, json('PATCH', { modelo: 'inventado xyz' })), params(body.id));
        expect(ruim.status).toBe(400);
        const bom = await PATCH(req(`/api/dealership/repasse/${body.id}`, json('PATCH', { modelo: 'COROLLA XEI' })), params(body.id));
        expect((await bom.json()).modelo).toBe('COROLLA XEI');
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
        await criarComoDonoA({ ...onix, modelo: 'CG 160 FAN', marca: 'HONDA', tipoVeiculo: 'moto', km: '12000' });
        // Vendido: a loja remove o anúncio, e ele some da vitrine.
        const vendido = await criarComoDonoA({ ...onix, modelo: 'HB20 VENDIDO', marca: 'HYUNDAI' });
        session.current = donoA;
        await DELETE(req(`/api/dealership/repasse/${vendido.body.id}`, { method: 'DELETE' }), params(vendido.body.id));
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
            // O removido não conta: sobraram os dois anunciados.
            expect((await (await GET(req('/api/dealership/repasse'))).json()).total).toBe(2);
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

    it('busca vale para o usado', async () => {
        expect((await vitrine('search=onix')).data.map((v: any) => v.modelo)).toEqual(['ONIX LT 1.0 TURBO']);
        expect((await vitrine('search=fan')).data.map((v: any) => v.modelo)).toEqual(['CG 160 FAN']);
    });

    it('anúncio removido sai da vitrine e da lista da loja', async () => {
        expect((await vitrine('tipo=repasse')).data.find((v: any) => v.modelo === 'HB20 VENDIDO')).toBeUndefined();
        session.current = donoA;
        const lista = await (await GET(req('/api/dealership/repasse'))).json();
        expect(lista.data.find((r: any) => r.modelo === 'HB20 VENDIDO')).toBeUndefined();
    });

    it('concessionária na vitrine vê o próprio repasse, não o de outra loja', async () => {
        session.current = donoB;
        await POST(req('/api/dealership/repasse', json('POST', { ...onix, modelo: 'ARGO DA LOJA B' })));
        const res = await VITRINE(req('/api/vehicles?limit=50&tipo=repasse&accessProfile=concessionaria'));
        const body = await res.json();
        expect(body.data.map((v: any) => v.modelo)).toEqual(['ARGO DA LOJA B']);
    });
});

describe('catálogo — lista de modelos para o cadastro de repasse', () => {
    const buscar = async (qs: string) => {
        session.current = donoA;
        const res = await MODELOS(req(`/api/catalog/modelos?${qs}`));
        expect(res.status).toBe(200);
        return (await res.json()).modelos as string[];
    };

    it('filtra por texto digitado', async () => {
        expect(await buscar('q=onix')).toEqual(['ONIX LT 1.0 TURBO']);
        expect(await buscar('q=coro')).toEqual(['COROLLA XEI']);
    });

    it('filtra por marca e por tipo', async () => {
        expect(await buscar('marca=HONDA MOTOS')).toEqual(['CG 160 FAN', 'HONDA CG160 TITAN']);
        expect(await buscar('tipoVeiculo=moto')).toEqual(['CG 160 FAN', 'HONDA CG160 TITAN']);
    });

    it('exige estar logado', async () => {
        session.current = null;
        expect((await MODELOS(req('/api/catalog/modelos'))).status).toBe(401);
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
        const lista = await modelos('moto');
        expect(lista.sort()).toEqual(['CG 160 FAN', 'HONDA CG160 TITAN']);
        expect(lista).not.toContain('COROLLA XEI');
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
        const lista = await modelos('todos');
        // Catálogo 0KM inteiro mais o modelo do usado cadastrado no beforeEach.
        expect(lista.sort()).toEqual(['ARGO DA LOJA B', 'CG 160 FAN', 'COROLLA XEI', 'HB20 VENDIDO', 'HONDA CG160 TITAN', 'ONIX LT 1.0 TURBO']);
    });
});
