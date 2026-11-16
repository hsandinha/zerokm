// @vitest-environment node
// Atendentes da concessionária (lib/services/atendentesLojaService.ts) com
// coleções falsas em memória e o Firebase Auth espionado: limite, e-mail em
// uso, isolamento entre lojas e queda da sessão ao desativar ou remover.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);
const firebase = vi.hoisted(() => ({
    criados: [] as any[], apagados: [] as string[], revogados: [] as string[],
    atualizados: [] as { uid: string; dados: any }[], emUso: new Set<string>(), n: 0,
}));

vi.mock('@/lib/firebase-admin', () => ({
    adminAuth: {
        createUser: async (dados: any) => {
            if (firebase.emUso.has(dados.email)) throw Object.assign(new Error('existe'), { code: 'auth/email-already-exists' });
            firebase.criados.push(dados);
            return { uid: `fb-${++firebase.n}` };
        },
        deleteUser: async (uid: string) => { firebase.apagados.push(uid); },
        updateUser: async (uid: string, dados: any) => { firebase.atualizados.push({ uid, dados }); },
        revokeRefreshTokens: async (uid: string) => { firebase.revogados.push(uid); },
        getUser: async () => ({ metadata: { lastSignInTime: 'Mon, 02 Nov 2026 12:00:00 GMT' } }),
    },
}));

async function fake() {
    const { FakeModel, casa } = await import('../wa/helpers/fake-model');
    return class extends FakeModel {
        findById(id: unknown) { return this.findOne({ _id: id }); }
        async deleteOne(filtro: Record<string, unknown>) {
            const i = this.docs.findIndex(d => casa(d, filtro));
            if (i >= 0) this.docs.splice(i, 1);
            return { deletedCount: i >= 0 ? 1 : 0 };
        }
    };
}
vi.mock('@/models/User', async () => { fakes.users = new (await fake())(); return { default: fakes.users }; });
vi.mock('@/models/Concessionaria', async () => { fakes.lojas = new (await fake())(); return { default: fakes.lojas }; });

import {
    criarAtendente, definirLimiteDeAtendentes, definirPapelNaLoja, definirSituacaoDoAtendente, editarAtendente,
    listarAtendentes, removerAtendente,
} from '@/lib/services/atendentesLojaService';

const LOJA = new mongoose.Types.ObjectId();
const OUTRA = new mongoose.Types.ObjectId();
const loja = String(LOJA);
const outra = String(OUTRA);

const usuarios = () => fakes.users.docs as any[];
const porEmail = (email: string) => usuarios().find(u => u.email === email);
const novo = (n: number) => ({ nome: `Atendente ${n}`, email: `a${n}@loja.com`, telefone: '31999990000' });

beforeEach(() => {
    Object.assign(firebase, { criados: [], apagados: [], revogados: [], atualizados: [], emUso: new Set(), n: 0 });
    fakes.lojas.reset([{ _id: LOJA, nome: 'Loja A' }, { _id: OUTRA, nome: 'Loja B', limiteAtendentes: 1 }]);
    fakes.users.reset([
        { email: 'dono@loja.com', displayName: 'Dono', firebaseUid: 'fb-dono', dealershipId: loja, allowedProfiles: ['concessionaria'], currentSessionToken: 't-dono' },
        { email: 'dono@outra.com', displayName: 'Dono B', firebaseUid: 'fb-dono-b', dealershipId: outra, allowedProfiles: ['concessionaria'] },
        { email: 'lojista@x.com', displayName: 'Lojista', firebaseUid: 'fb-loj', allowedProfiles: ['cliente'] },
    ]);
});

describe('cadastro', () => {
    it('cria o login ligado à loja, como atendente, com senha provisória e troca no primeiro acesso', async () => {
        const r = await criarAtendente(loja, novo(1), 'dono@loja.com');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.senhaProvisoria).toMatch(/^CNV@.{6}$/);
        expect(firebase.criados[0]).toMatchObject({ email: 'a1@loja.com', password: r.senhaProvisoria, disabled: false });
        expect(porEmail('a1@loja.com')).toMatchObject({
            dealershipId: loja, papelLoja: 'atendente', allowedProfiles: ['concessionaria'], defaultProfile: 'concessionaria',
            forcePasswordChange: true, phoneNumber: '31999990000', atendenteCriadoPor: 'dono@loja.com',
        });
    });

    it('recusa e-mail de outro perfil, de outra loja e do titular, sem criar nada no Firebase', async () => {
        for (const email of ['lojista@x.com', 'dono@outra.com', 'DONO@loja.com']) {
            const r = await criarAtendente(loja, { nome: 'Ana', email });
            expect(r).toMatchObject({ ok: false, status: 409 });
        }
        expect(firebase.criados).toHaveLength(0);
        expect(usuarios()).toHaveLength(3);
    });

    it('e-mail com login só no Firebase também é recusado com mensagem clara', async () => {
        firebase.emUso.add('orfao@x.com');
        const r = await criarAtendente(loja, { nome: 'Ana', email: 'orfao@x.com' });
        expect(r).toMatchObject({ ok: false, status: 409 });
        if (!r.ok) expect(r.error).toContain('já tem login');
    });

    it('limite padrão de 5 ativos; o sexto é recusado', async () => {
        for (let n = 1; n <= 5; n++) expect((await criarAtendente(loja, novo(n))).ok).toBe(true);
        const r = await criarAtendente(loja, novo(6));
        expect(r).toMatchObject({ ok: false, status: 409 });
        expect(firebase.criados).toHaveLength(5);
    });

    it('o limite é por concessionária e o admin pode mudar', async () => {
        expect((await criarAtendente(outra, { nome: 'B1', email: 'b1@outra.com' })).ok).toBe(true);
        expect(await criarAtendente(outra, { nome: 'B2', email: 'b2@outra.com' })).toMatchObject({ ok: false, status: 409 });
        expect(await definirLimiteDeAtendentes(outra, 2)).toEqual({ ok: true, limite: 2 });
        expect((await criarAtendente(outra, { nome: 'B2', email: 'b2@outra.com' })).ok).toBe(true);
        expect(await definirLimiteDeAtendentes(outra, 'muitos')).toMatchObject({ ok: false, status: 400 });
        expect(await definirLimiteDeAtendentes(String(new mongoose.Types.ObjectId()), 3)).toMatchObject({ ok: false, status: 404 });
    });

    it('se o banco falhar, o login não fica órfão no Firebase', async () => {
        const original = fakes.users.create;
        fakes.users.create = async () => { throw new Error('banco fora'); };
        await expect(criarAtendente(loja, novo(1))).rejects.toThrow('banco fora');
        fakes.users.create = original;
        expect(firebase.apagados).toEqual(['fb-1']);
    });

    it('concessionária inexistente ou dados inválidos', async () => {
        expect(await criarAtendente(String(new mongoose.Types.ObjectId()), novo(1))).toMatchObject({ ok: false, status: 404 });
        expect(await criarAtendente('nao-e-id', novo(1))).toMatchObject({ ok: false, status: 404 });
        expect(await criarAtendente(loja, { nome: 'Ana', email: 'ruim' })).toMatchObject({ ok: false, status: 400 });
    });
});

describe('lista', () => {
    it('separa titulares de atendentes e conta só os ativos', async () => {
        await criarAtendente(loja, novo(1));
        await criarAtendente(loja, novo(2));
        await definirSituacaoDoAtendente(loja, String(porEmail('a2@loja.com')._id), false);
        const r = await listarAtendentes(loja);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.titulares.map(t => t.email)).toEqual(['dono@loja.com']);
        expect(r.atendentes.map(a => [a.email, a.ativo])).toEqual([['a1@loja.com', true], ['a2@loja.com', false]]);
        expect(r.atendentes[0].ultimoAcesso).toBe('2026-11-02T12:00:00.000Z');
        expect(r).toMatchObject({ limite: 5, ativos: 1 });
    });
});

describe('isolamento entre lojas', () => {
    it('o id de um atendente de outra loja não é encontrado por nenhuma ação', async () => {
        await criarAtendente(outra, { nome: 'B1', email: 'b1@outra.com' });
        const alheio = String(porEmail('b1@outra.com')._id);
        expect(await editarAtendente(loja, alheio, { nome: 'Hackeado' })).toMatchObject({ ok: false, status: 404 });
        expect(await definirSituacaoDoAtendente(loja, alheio, false)).toMatchObject({ ok: false, status: 404 });
        expect(await removerAtendente(loja, alheio)).toMatchObject({ ok: false, status: 404 });
        expect(await definirPapelNaLoja(loja, alheio, 'titular')).toMatchObject({ ok: false, status: 404 });
        expect(porEmail('b1@outra.com')).toMatchObject({ displayName: 'B1', dealershipId: outra, papelLoja: 'atendente' });
        expect(firebase.apagados).toHaveLength(0);
    });

    it('o titular não é editado, desativado nem removido pela tela de atendentes', async () => {
        const dono = String(porEmail('dono@loja.com')._id);
        expect(await editarAtendente(loja, dono, { nome: 'X' })).toMatchObject({ ok: false, status: 404 });
        expect(await definirSituacaoDoAtendente(loja, dono, false)).toMatchObject({ ok: false, status: 404 });
        expect(await removerAtendente(loja, dono)).toMatchObject({ ok: false, status: 404 });
        expect(porEmail('dono@loja.com').currentSessionToken).toBe('t-dono');
    });
});

describe('desativar, reativar e remover', () => {
    async function comSessao() {
        await criarAtendente(loja, novo(1));
        const u = porEmail('a1@loja.com');
        u.currentSessionToken = 'sessao-aberta';
        return String(u._id);
    }

    it('desativar bloqueia o login, derruba a sessão e libera a vaga', async () => {
        const id = await comSessao();
        expect((await definirSituacaoDoAtendente(loja, id, false)).ok).toBe(true);
        const u = porEmail('a1@loja.com');
        expect(u.atendenteInativo).toBe(true);
        expect(u.currentSessionToken).toBeUndefined();
        expect(firebase.atualizados).toContainEqual({ uid: 'fb-1', dados: { disabled: true } });
        expect(firebase.revogados).toEqual(['fb-1']);
    });

    it('reativar passa pelo limite', async () => {
        await definirLimiteDeAtendentes(loja, 1);
        const id = await comSessao();
        await definirSituacaoDoAtendente(loja, id, false);
        expect((await criarAtendente(loja, novo(2))).ok).toBe(true);
        expect(await definirSituacaoDoAtendente(loja, id, true)).toMatchObject({ ok: false, status: 409 });
        await removerAtendente(loja, String(porEmail('a2@loja.com')._id));
        expect((await definirSituacaoDoAtendente(loja, id, true)).ok).toBe(true);
        expect(porEmail('a1@loja.com').atendenteInativo).toBe(false);
        expect(firebase.atualizados).toContainEqual({ uid: 'fb-1', dados: { disabled: false } });
    });

    it('remover apaga o login nos dois lados e o e-mail fica livre', async () => {
        const id = await comSessao();
        expect(await removerAtendente(loja, id)).toEqual({ ok: true, email: 'a1@loja.com' });
        expect(porEmail('a1@loja.com')).toBeUndefined();
        expect(firebase.apagados).toEqual(['fb-1']);
        expect((await criarAtendente(loja, novo(1))).ok).toBe(true);
    });

    it('editar muda nome e telefone, nunca o e-mail nem a loja', async () => {
        const id = await comSessao();
        const r = await editarAtendente(loja, id, { nome: 'Ana Paula', telefone: '', email: 'outro@x.com', dealershipId: outra });
        expect(r.ok).toBe(true);
        const u = porEmail('a1@loja.com');
        expect(u).toMatchObject({ displayName: 'Ana Paula', dealershipId: loja, papelLoja: 'atendente' });
        expect(u.phoneNumber).toBeUndefined();
        expect(porEmail('outro@x.com')).toBeUndefined();
    });
});

describe('papel (equipe do CNV, lojas com mais de um login antigo)', () => {
    it('não deixa a loja sem titular', async () => {
        const dono = String(porEmail('dono@loja.com')._id);
        expect(await definirPapelNaLoja(loja, dono, 'atendente')).toMatchObject({ ok: false, status: 409 });
    });

    it('rebaixa o segundo titular e devolve a titularidade', async () => {
        fakes.users.docs.push({ _id: new mongoose.Types.ObjectId(), email: 'socio@loja.com', dealershipId: loja, allowedProfiles: ['concessionaria'] });
        const socio = String(porEmail('socio@loja.com')._id);
        expect(await definirPapelNaLoja(loja, socio, 'atendente')).toEqual({ ok: true, papel: 'atendente' });
        expect(porEmail('socio@loja.com').papelLoja).toBe('atendente');
        expect(await definirPapelNaLoja(loja, socio, 'titular')).toEqual({ ok: true, papel: 'titular' });
        expect(porEmail('socio@loja.com').papelLoja).toBe('titular');
    });
});
