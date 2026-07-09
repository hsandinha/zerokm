// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// A sessão é trocada por teste; o connectDB real é substituído porque a conexão
// é aberta uma vez contra o Mongo em memória.
const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { GET as getLeads, POST as postLead } from '@/app/api/crm/leads/route';
import { GET as getLead } from '@/app/api/crm/leads/[id]/route';
import { PUT as putLeadStage } from '@/app/api/crm/leads/[id]/stage/route';
import { GET as getStages } from '@/app/api/crm/stages/route';
import { POST as seedStages } from '@/app/api/crm/stages/seed/route';
import { GET as getReports } from '@/app/api/crm/reports/route';
import { POST as webhookLeads } from '@/app/api/webhooks/leads/route';
import Lead from '@/models/Lead';
import LeadStage from '@/models/LeadStage';
import User from '@/models/User';

const ADMIN = { user: { email: 'admin@cnv.com.br', profile: 'administrador' } };
const OUTRA_CONCESSIONARIA = new mongoose.Types.ObjectId();

let srv: MongoMemoryServer;

const get = (url: string) => new Request(`http://localhost${url}`);
const post = (url: string, body: any) =>
    new Request(`http://localhost${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
const put = (url: string, body: any) =>
    new Request(`http://localhost${url}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function stageIds() {
    const res = await getStages(get('/api/crm/stages'));
    const { data } = await res.json();
    return new Map<string, string>(data.map((s: any) => [s.name, s.id]));
}

async function criarLead(body: Record<string, any>, stages: Map<string, string>) {
    const res = await postLead(post('/api/crm/leads', { stageId: stages.get('Novos Leads'), ...body }));
    expect(res.status).toBe(201);
    return res.json();
}

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'crm-test' });
}, 300000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv.stop();
});

beforeEach(async () => {
    session.current = ADMIN;
    await Promise.all(
        Object.values(mongoose.connection.collections).map(c => c.deleteMany({})),
    );
});

describe('funil comercial ponta a ponta', () => {
    it('cria o funil padrão de 11 etapas e recusa recriar', async () => {
        const first = await seedStages();
        expect(first.status).toBe(201);

        const { data } = await first.json();
        expect(data).toHaveLength(11);
        expect(data[0].name).toBe('Novos Leads');
        expect(data.find((s: any) => s.name === 'Proposta Enviada').type).toBe('proposal');
        expect(data.find((s: any) => s.name === 'Venda Ganha').type).toBe('won');
        expect(data.find((s: any) => s.name === 'Venda Perdida').type).toBe('lost');

        expect((await seedStages()).status).toBe(409);
    });

    it('exige motivo para mover um lead para Venda Perdida', async () => {
        await seedStages();
        const stages = await stageIds();
        const lead = await criarLead({ name: 'Fulano', phone: '31999990000' }, stages);

        const semMotivo = await putLeadStage(
            put(`/api/crm/leads/${lead.id}/stage`, { stageId: stages.get('Venda Perdida') }),
            ctx(lead.id),
        );
        expect(semMotivo.status).toBe(400);
        expect((await semMotivo.json()).code).toBe('LOST_REASON_REQUIRED');

        // O lead não pode ter se movido.
        expect((await Lead.findById(lead.id))!.stageId.toString()).toBe(stages.get('Novos Leads'));

        const motivoInvalido = await putLeadStage(
            put(`/api/crm/leads/${lead.id}/stage`, { stageId: stages.get('Venda Perdida'), lostReason: 'chovia' }),
            ctx(lead.id),
        );
        expect(motivoInvalido.status).toBe(400);

        const comMotivo = await putLeadStage(
            put(`/api/crm/leads/${lead.id}/stage`, {
                stageId: stages.get('Venda Perdida'),
                lostReason: 'preco',
                lostReasonNote: 'R$ 2 mil acima',
            }),
            ctx(lead.id),
        );
        expect(comMotivo.status).toBe(200);
        expect((await comMotivo.json()).lostReason).toBe('preco');
    });

    it('conta propostas e vendas pelo histórico, não pela fase atual', async () => {
        await seedStages();
        const stages = await stageIds();

        const ganho = await criarLead(
            { name: 'Ganho', phone: '31900000001', firstMessage: 'Olá! Vim do anúncio e gostaria de criar minha conta no CNV' },
            stages,
        );
        const perdido = await criarLead({ name: 'Perdido', phone: '31900000002' }, stages);

        // Passa por Proposta Enviada e termina em Venda Ganha.
        await putLeadStage(put(`/api/crm/leads/${ganho.id}/stage`, { stageId: stages.get('Proposta Enviada') }), ctx(ganho.id));
        await putLeadStage(put(`/api/crm/leads/${ganho.id}/stage`, { stageId: stages.get('Venda Ganha') }), ctx(ganho.id));
        await putLeadStage(
            put(`/api/crm/leads/${perdido.id}/stage`, { stageId: stages.get('Venda Perdida'), lostReason: 'concorrente' }),
            ctx(perdido.id),
        );

        const { data } = await (await getReports(get('/api/crm/reports?preset=all'))).json();

        // O lead "Ganho" já não está em Proposta Enviada, mas passou por lá.
        expect(data.radar).toEqual({ leadsCriados: 2, propostasEnviadas: 1, vendasGanhas: 1, vendasPerdidas: 1 });
        expect(data.conversao).toEqual({ leadParaProposta: 50, propostaParaVenda: 100, geral: 50 });

        const proposta = data.porEtapa.find((e: any) => e.name === 'Proposta Enviada');
        expect(proposta.entradas).toBe(1);
        expect(proposta.atuais).toBe(0);

        expect(data.motivosPerda).toEqual([
            { reason: 'concorrente', label: 'Concorrente', total: 1, percentual: 100 },
        ]);
    });

    it('atribui conversão à origem certa', async () => {
        await seedStages();
        const stages = await stageIds();

        const meta = await criarLead(
            { name: 'Do Meta', phone: '31900000003', firstMessage: 'Olá! Vim do anúncio e gostaria de criar minha conta no CNV' },
            stages,
        );
        await criarLead({ name: 'Sem tag', phone: '31900000004' }, stages);

        await putLeadStage(put(`/api/crm/leads/${meta.id}/stage`, { stageId: stages.get('Proposta Enviada') }), ctx(meta.id));
        await putLeadStage(put(`/api/crm/leads/${meta.id}/stage`, { stageId: stages.get('Venda Ganha') }), ctx(meta.id));

        const { data } = await (await getReports(get('/api/crm/reports?preset=all'))).json();

        expect(data.porOrigem).toEqual([
            { tag: 'Meta - Público Aberto', criados: 1, propostas: 1, ganhas: 1, conversao: 100 },
            { tag: 'Sem origem', criados: 1, propostas: 0, ganhas: 0, conversao: 0 },
        ]);
    });

    it('o filtro de origem recorta o radar, não só o quadro', async () => {
        await seedStages();
        const stages = await stageIds();

        const meta = await criarLead(
            { name: 'Do Meta', phone: '31900000010', firstMessage: 'Olá! Vim do anúncio e gostaria de criar minha conta no CNV' },
            stages,
        );
        const google = await criarLead(
            { name: 'Do Google', phone: '31900000011', firstMessage: 'Olá, vim pelo site e gostaria de criar minha conta na plataforma' },
            stages,
        );

        await putLeadStage(put(`/api/crm/leads/${meta.id}/stage`, { stageId: stages.get('Proposta Enviada') }), ctx(meta.id));
        await putLeadStage(put(`/api/crm/leads/${google.id}/stage`, { stageId: stages.get('Venda Ganha') }), ctx(google.id));

        const tag = encodeURIComponent('Meta - Público Aberto');
        const { data } = await (await getReports(get(`/api/crm/reports?preset=all&tags=${tag}`))).json();

        // Só o lead do Meta entra na conta: 1 criado, 1 proposta, 0 vendas.
        expect(data.radar).toEqual({ leadsCriados: 1, propostasEnviadas: 1, vendasGanhas: 0, vendasPerdidas: 0 });
        expect(data.porOrigem.map((o: any) => o.tag)).toEqual(['Meta - Público Aberto']);

        const semFiltro = await (await getReports(get('/api/crm/reports?preset=all'))).json();
        expect(semFiltro.data.radar.leadsCriados).toBe(2);
        expect(semFiltro.data.radar.vendasGanhas).toBe(1);
    });

    it('o filtro de período recorta os leads e o radar', async () => {
        await seedStages();
        const stages = await stageIds();
        await criarLead({ name: 'De hoje', phone: '31900000005' }, stages);

        const hoje = await (await getLeads(get('/api/crm/leads?preset=day'))).json();
        expect(hoje.data).toHaveLength(1);

        const passado = await (await getLeads(get('/api/crm/leads?preset=custom&from=2020-01-01&to=2020-01-31'))).json();
        expect(passado.data).toHaveLength(0);

        const radarPassado = await (await getReports(get('/api/crm/reports?preset=custom&from=2020-01-01&to=2020-01-31'))).json();
        expect(radarPassado.data.radar.leadsCriados).toBe(0);
    });

    it('o histórico do lead lista as movimentações em ordem', async () => {
        await seedStages();
        const stages = await stageIds();
        const lead = await criarLead({ name: 'Histórico', phone: '31900000006' }, stages);

        await putLeadStage(put(`/api/crm/leads/${lead.id}/stage`, { stageId: stages.get('1º Contato') }), ctx(lead.id));
        await putLeadStage(put(`/api/crm/leads/${lead.id}/stage`, { stageId: stages.get('Proposta Enviada') }), ctx(lead.id));

        const { data } = await (await getLead(get(`/api/crm/leads/${lead.id}`), ctx(lead.id))).json();

        expect(data.stageName).toBe('Proposta Enviada');
        expect(data.stageType).toBe('proposal');
        expect(data.history.map((e: any) => [e.type, e.fromStageName, e.toStageName])).toEqual([
            ['created', null, 'Novos Leads'],
            ['stage_changed', 'Novos Leads', '1º Contato'],
            ['stage_changed', '1º Contato', 'Proposta Enviada'],
        ]);
    });

    it('o pipeline global não enxerga leads de concessionária', async () => {
        await seedStages();
        const stages = await stageIds();
        await criarLead({ name: 'Global', phone: '31900000007' }, stages);

        const stageDaOutra = await LeadStage.create({ name: 'X', order: 0, concessionariaId: OUTRA_CONCESSIONARIA });
        await Lead.create({
            name: 'Da concessionária', phone: '31900000008',
            stageId: stageDaOutra._id, concessionariaId: OUTRA_CONCESSIONARIA,
        });

        const { data } = await (await getLeads(get('/api/crm/leads?preset=all'))).json();

        expect(data.map((l: any) => l.name)).toEqual(['Global']);
    });
});

describe('webhook de leads', () => {
    const TOKEN = 'zkm_token_de_teste';

    beforeEach(async () => {
        await User.create({
            firebaseUid: 'uid-admin',
            email: 'admin@cnv.com.br',
            allowedProfiles: ['administrador'],
            webhookSecret: TOKEN,
        });
        await seedStages();
    });

    it('autentica o token de admin e classifica a origem pela frase inicial', async () => {
        const res = await webhookLeads(post(`/api/webhooks/leads?token=${TOKEN}`, {
            name: 'Lead do anúncio',
            phone: '31988887777',
            message: 'Olá! Gostaria de criar minha conta no CNV que vi no anúncio',
        }));

        expect(res.status).toBe(201);
        const { data } = await res.json();
        expect(data.tags).toEqual(['Meta - Público Segmentado']);

        const lead = await Lead.findById(data.id);
        expect(lead!.tags).toEqual(['Meta - Público Segmentado']);

        // Entrou na primeira fase aberta, não em "Venda Ganha" por acidente de ordenação.
        const stages = await stageIds();
        expect(lead!.stageId.toString()).toBe(stages.get('Novos Leads'));
    });

    it('recusa token inválido', async () => {
        const res = await webhookLeads(post('/api/webhooks/leads?token=nao_existe', { name: 'X', phone: '1' }));
        expect(res.status).toBe(401);
    });
});
