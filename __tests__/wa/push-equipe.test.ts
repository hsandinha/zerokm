// @vitest-environment node
// Push só para quem é da equipe hoje (wa/lib/push.ts + wa/lib/equipe-loja.ts):
// o ex-funcionário perde a inscrição em vez de seguir recebendo o nome e a
// mensagem dos clientes. Coleções falsas em memória; o envio é um espião.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
const espioes = vi.hoisted(() => ({ enviados: [] as string[], loja: null as any }));

vi.hoisted(() => {
    process.env.VAPID_PUBLIC_KEY = 'publica';
    process.env.VAPID_PRIVATE_KEY = 'privada';
    process.env.VAPID_SUBJECT = 'mailto:teste@cnv.com.br';
});

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
vi.mock('web-push', () => ({
    default: {
        setVapidDetails: () => undefined,
        sendNotification: async (s: { endpoint: string }) => {
            espioes.enviados.push(s.endpoint);
        },
    },
}));
vi.mock('@wa/models/operacao', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.atendentes = new FakeModel();
    fakes.inscricoes = new FakeModel();
    return { WaAtendente: fakes.atendentes, WaPushInscricao: fakes.inscricoes };
});
vi.mock('@/models/User', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    class Fake extends FakeModel {
        findById(id: unknown) {
            return this.findOne({ _id: id });
        }
    }
    fakes.users = new Fake();
    return { default: fakes.users };
});
vi.mock('@/models/Invite', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.convites = new FakeModel();
    return { default: fakes.convites };
});
vi.mock('@wa/models/panel', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.admins = new FakeModel();
    return { WaAdmin: fakes.admins };
});
vi.mock('@wa/lib/store', () => ({ getStore: async (id: string) => (espioes.loja && String(espioes.loja._id) === id ? espioes.loja : null) }));

import { enviarPush } from '@wa/lib/push';
import { emailsDaEquipe } from '@wa/lib/equipe-loja';

const DONO = new mongoose.Types.ObjectId();
const SUB = new mongoose.Types.ObjectId();
const LOJA = new mongoose.Types.ObjectId();
const aviso = { titulo: 'Mensagem de Marina', url: '/c/1' };

function inscricao(email: string, tenantId: string | null = String(LOJA)) {
    return { tenantId, email, endpoint: `https://push.example/${email}`, p256dh: 'k', auth: 'a' };
}

beforeEach(() => {
    espioes.enviados.length = 0;
    espioes.loja = {
        _id: LOJA,
        kind: 'lojista',
        ownerUserId: DONO,
        members: [{ email: 'ana@loja.com', name: 'Ana', role: 'atendente' }],
    };
    fakes.users.reset([
        { _id: DONO, email: 'dono@loja.com', allowedProfiles: ['cliente'] },
        { _id: SUB, email: 'sub@loja.com', allowedProfiles: ['cliente'] },
        { email: 'chefe@zerokm.com', allowedProfiles: ['administrador'] },
    ]);
    fakes.convites.reset([{ inviterId: DONO, inviteeUserId: SUB, status: 'accepted' }]);
    fakes.admins.reset([{ email: 'vera@cnv.com.br', role: 'operador' }]);
    fakes.atendentes.reset([]);
    fakes.inscricoes.reset([]);
});

describe('equipe atual', () => {
    it('loja: membros, titular e sub-usuários; CNV: wa_admins e administradores da zerokm', async () => {
        expect([...(await emailsDaEquipe(String(LOJA)))].sort()).toEqual(['ana@loja.com', 'dono@loja.com', 'sub@loja.com']);
        expect([...(await emailsDaEquipe(null))].sort()).toEqual(['chefe@zerokm.com', 'vera@cnv.com.br']);
        expect((await emailsDaEquipe(new mongoose.Types.ObjectId().toHexString())).size).toBe(0);
    });
});

describe('push', () => {
    it('quem saiu da equipe não recebe e perde a inscrição; quem ficou recebe', async () => {
        fakes.inscricoes.reset([inscricao('ana@loja.com'), inscricao('ex@loja.com')]);
        const n = await enviarPush({ tenantId: String(LOJA), emails: ['Ana@loja.com', 'ex@loja.com'], aviso });
        expect(n).toBe(1);
        expect(espioes.enviados).toEqual(['https://push.example/ana@loja.com']);
        expect(fakes.inscricoes.docs.map((d: any) => d.email)).toEqual(['ana@loja.com']);
    });

    it('membro removido da loja deixa de receber na hora', async () => {
        fakes.inscricoes.reset([inscricao('ana@loja.com')]);
        espioes.loja.members = [];
        expect(await enviarPush({ tenantId: String(LOJA), emails: ['ana@loja.com'], aviso })).toBe(0);
        expect(espioes.enviados).toHaveLength(0);
        expect(fakes.inscricoes.docs).toHaveLength(0);
    });
});
