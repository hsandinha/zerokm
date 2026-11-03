// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
// Equipe do CNV fica de fora: aqui só entram lojas.
vi.mock('@wa/lib/auth', () => ({ getPanelUser: async () => null }));

import { GET as listar, PATCH as salvar } from '@/app/api/admin/recursos/route';
import { GET as meusRecursos } from '@/app/api/user/recursos/route';
import { GET as campanhas } from '@/app/api/wa/campaigns/route';
import { getScope, requireScope } from '@wa/lib/scope';
import { WaStore } from '@wa/models/store';

let srv: MongoMemoryServer;

const CONC = new mongoose.Types.ObjectId();
const ADMIN = { user: { email: 'admin@cnv.com.br', profile: 'administrador' } };
const LOJA = { user: { email: 'gerente@loja.com.br', profile: 'concessionaria', allowedProfiles: ['concessionaria'] } };

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri(), { dbName: 'zerokm-test' });
    const db = mongoose.connection.db!;
    await db.collection('concessionarias').insertOne({ _id: CONC, nome: 'Loja Piloto', cidade: 'BH', uf: 'MG', ativo: true });
    await db.collection('users').insertOne({ email: LOJA.user.email, firebaseUid: 'x', allowedProfiles: ['concessionaria'], dealershipId: String(CONC) });
}, 120_000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv?.stop();
});

const liberar = (recursos: Record<string, boolean>, quem: any = ADMIN) => {
    session.current = quem;
    return salvar(new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ tipo: 'concessionaria', id: String(CONC), recursos }),
    }));
};

describe('funcionalidades liberadas pelo CNV', () => {
    it('só o administrador vê e libera', async () => {
        session.current = LOJA;
        expect((await listar(new Request('http://localhost/api/admin/recursos'))).status).toBe(403);
        expect((await liberar({ atendimento: true }, LOJA)).status).toBe(403);
    });

    it('sem liberar, a loja não ganha atendimento nem começa o teste', async () => {
        session.current = LOJA;
        expect(await getScope()).toBeNull();
        expect(await WaStore.countDocuments()).toBe(0);
        const { recursos } = await (await meusRecursos()).json();
        expect(recursos.atendimento).toBe(false);
        expect(recursos.crm).toBe(true);
    });

    it('liberado, a loja nasce no primeiro acesso com o pacote do atendimento', async () => {
        const res = await liberar({ atendimento: true, crm: true, anuncios: true, funil: true, campanhas: false, ia: true, simulador: true, instagram: true, sms: true });
        expect(res.status).toBe(200);
        const conta = await res.json();
        expect(conta.recursos.atendimento).toBe(true);
        expect(conta.atendimento.status).toBe('nao_iniciado');

        session.current = LOJA;
        const scope = await requireScope();
        expect(scope.store?.recursos.campanhas).toBe(false);
        expect(await WaStore.countDocuments({ concessionariaId: CONC })).toBe(1);

        // Grava só a diferença do padrão.
        const doc = await mongoose.connection.db!.collection('concessionarias').findOne({ _id: CONC });
        expect(doc?.recursos).toEqual({ atendimento: true, campanhas: false });
    });

    it('funcionalidade desligada é recusada pela rota, não só escondida', async () => {
        session.current = LOJA;
        const res = await campanhas();
        expect(res.status).toBeGreaterThanOrEqual(401);
        await expect(requireScope('campanhas')).rejects.toMatchObject({ status: 403 });
    });

    it('desligar o atendimento depois tira a loja do atendimento sem apagar nada', async () => {
        await liberar({ atendimento: false });
        session.current = LOJA;
        await expect(requireScope()).rejects.toMatchObject({ status: 403 });
        expect(await WaStore.countDocuments({ concessionariaId: CONC })).toBe(1);
    });

    it('a lista mostra quantas estão liberadas', async () => {
        session.current = ADMIN;
        const res = await listar(new Request('http://localhost/api/admin/recursos?tipo=concessionaria&q=piloto'));
        const { data } = await res.json();
        expect(data).toHaveLength(1);
        expect(data[0].nome).toBe('Loja Piloto');
        expect(data[0].recursos.atendimento).toBe(false);
    });
});
