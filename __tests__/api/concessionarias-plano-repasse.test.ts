// @vitest-environment node
//
// A listagem de concessionárias precisa dizer quem assinou o repasse.
//
// Antes disso, a única forma de descobrir era abrir Estoque, escolher uma loja
// e olhar a aba Repasse — uma de cada vez, em 971. O campo vinha do banco mas
// era descartado na serialização, então a tela não tinha como mostrar nem
// filtrar.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { GET as listarConcessionarias } from '@/app/api/concessionarias/route';
import Concessionaria from '@/models/Concessionaria';

const ADMIN = { user: { email: 'admin@cnv.com.br', profile: 'administrador', uid: 'uid-admin' } };

const DIA = 24 * 60 * 60 * 1000;

let srv: MongoMemoryServer;

// O CNPJ tem índice único: cada loja do cenário precisa do seu.
let sequencia = 0;
const base = (nome: string) => ({
    nome,
    razaoSocial: `${nome} LTDA`,
    cnpj: String(++sequencia).padStart(14, '0'),
    telefone: '31999999999',
    contato: 'Fulano',
    email: 'x@y.com',
    endereco: 'Rua A',
    cidade: 'Belo Horizonte',
    uf: 'MG',
    cep: '30000000',
    nomeResponsavel: 'Fulano',
    telefoneResponsavel: '31999999999',
});

const listar = async () => {
    const res = await listarConcessionarias();
    return { status: res.status, body: await res.json() };
};

const porNome = (body: any[], nome: string) => body.find(c => c.nome === nome);

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri());
}, 60_000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv.stop();
});

beforeEach(async () => {
    session.current = ADMIN;
    await Concessionaria.deleteMany({});
    await Concessionaria.create([
        {
            ...base('COM PLANO'),
            planoRepasse: {
                planName: 'REPASSE CONCESSIONÁRIA',
                status: 'active',
                billingType: 'monthly',
                expiresAt: new Date(Date.now() + 30 * DIA),
                activationMethod: 'cortesia',
            },
        },
        {
            ...base('PLANO VENCIDO'),
            planoRepasse: {
                planName: 'REPASSE CONCESSIONÁRIA',
                status: 'active',
                billingType: 'monthly',
                expiresAt: new Date(Date.now() - DIA),
                activationMethod: 'manual',
            },
        },
        { ...base('CANCELADA'), planoRepasse: { status: 'cancelled', expiresAt: new Date(Date.now() + 30 * DIA) } },
        { ...base('SEM PLANO') },
    ]);
});

describe('GET /api/concessionarias — plano de repasse na listagem', () => {
    it('devolve o plano de cada loja', async () => {
        const { status, body } = await listar();

        expect(status).toBe(200);
        expect(porNome(body, 'COM PLANO').planoRepasse).toMatchObject({
            ativo: true,
            status: 'active',
            planName: 'REPASSE CONCESSIONÁRIA',
            billingType: 'monthly',
            activationMethod: 'cortesia',
        });
    });

    it('validade no passado não conta como ativo, mesmo com status active', async () => {
        // É o que separa "pode anunciar" de "precisa renovar" na tela.
        const vencida = porNome((await listar()).body, 'PLANO VENCIDO').planoRepasse;

        expect(vencida.ativo).toBe(false);
        expect(vencida.status).toBe('active');
        expect(vencida.expiresAt).not.toBeNull();
    });

    it('plano cancelado não vale, ainda que a data esteja no futuro', async () => {
        expect(porNome((await listar()).body, 'CANCELADA').planoRepasse.ativo).toBe(false);
    });

    it('loja que nunca assinou vem sem data, para não ser confundida com vencida', async () => {
        const semPlano = porNome((await listar()).body, 'SEM PLANO').planoRepasse;

        expect(semPlano.ativo).toBe(false);
        expect(semPlano.status).toBe('inactive');
        expect(semPlano.expiresAt).toBeNull();
    });

    it('dá para separar quem assina, quem deixou vencer e quem nunca assinou', async () => {
        // São os três grupos que a tela mostra: o indicador do topo, a aba
        // "Com repasse" e a aba "Sem repasse".
        const { body } = await listar();

        const ativos = body.filter((c: any) => c.planoRepasse?.ativo);
        const vencidos = body.filter((c: any) => !c.planoRepasse?.ativo && c.planoRepasse?.expiresAt);
        const nunca = body.filter((c: any) => !c.planoRepasse?.expiresAt);

        expect(ativos.map((c: any) => c.nome)).toEqual(['COM PLANO']);
        expect(vencidos.map((c: any) => c.nome).sort()).toEqual(['CANCELADA', 'PLANO VENCIDO']);
        expect(nunca.map((c: any) => c.nome)).toEqual(['SEM PLANO']);
    });

    it('continua exigindo sessão', async () => {
        session.current = null;

        expect((await listar()).status).toBe(401);
    });
});
