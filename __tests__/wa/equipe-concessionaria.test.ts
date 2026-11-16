// @vitest-environment node
// Atendimento por WhatsApp da concessionária: o titular entra como gestor, o
// atendente como atendente (operador) e o atendente desativado não entra
// (wa/lib/store.ts membershipFor + wa/lib/equipe-loja.ts membrosDaLoja).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

const fakes = vi.hoisted(() => ({}) as Record<string, any>);

vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));
vi.mock('@/lib/services/recursosConta', () => ({ recursosDaConta: async () => ({ atendimento: true }) }));
vi.mock('@/models/User', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.users = new FakeModel();
    return { default: fakes.users };
});
vi.mock('@/models/Invite', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.convites = new FakeModel();
    return { default: fakes.convites };
});
vi.mock('@/models/Concessionaria', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.lojas = new FakeModel();
    return { default: fakes.lojas };
});
vi.mock('@wa/models/panel', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    return { WaAdmin: new FakeModel() };
});
vi.mock('@wa/models/store', async () => {
    const { FakeModel } = await import('./helpers/fake-model');
    fakes.stores = new FakeModel();
    return { WaStore: fakes.stores };
});

import { membershipFor } from '@wa/lib/store';
import { membrosDaLoja } from '@wa/lib/equipe-loja';

const LOJA = new mongoose.Types.ObjectId();
const OUTRA = new mongoose.Types.ObjectId();
const perfis = ['concessionaria'];

beforeEach(() => {
    fakes.convites.reset([]);
    fakes.lojas.reset([{ _id: LOJA, nome: 'Loja A' }, { _id: OUTRA, nome: 'Loja B' }]);
    fakes.stores.reset([
        { kind: 'concessionaria', concessionariaId: LOJA, name: 'Loja A', members: [] },
        { kind: 'concessionaria', concessionariaId: OUTRA, name: 'Loja B', members: [] },
    ]);
    fakes.users.reset([
        { email: 'dono@loja.com', displayName: 'Dono', dealershipId: String(LOJA), allowedProfiles: perfis },
        { email: 'ana@loja.com', displayName: 'Ana', dealershipId: String(LOJA), allowedProfiles: perfis, papelLoja: 'atendente' },
        { email: 'ex@loja.com', displayName: 'Ex', dealershipId: String(LOJA), allowedProfiles: perfis, papelLoja: 'atendente', atendenteInativo: true },
        { email: 'bia@outra.com', displayName: 'Bia', dealershipId: String(OUTRA), allowedProfiles: perfis, papelLoja: 'atendente' },
    ]);
});

describe('papel no atendimento da concessionária', () => {
    it('titular é gestor, atendente é atendente', async () => {
        expect((await membershipFor({ email: 'dono@loja.com', profiles: perfis }))?.role).toBe('gestor');
        expect((await membershipFor({ email: 'ana@loja.com', profiles: perfis }))?.role).toBe('atendente');
    });

    it('cada um cai na loja da própria concessionária', async () => {
        const ana = await membershipFor({ email: 'ana@loja.com', profiles: perfis });
        const bia = await membershipFor({ email: 'bia@outra.com', profiles: perfis });
        expect(String(ana?.store.concessionariaId)).toBe(String(LOJA));
        expect(String(bia?.store.concessionariaId)).toBe(String(OUTRA));
    });

    it('atendente desativado não entra no atendimento', async () => {
        expect(await membershipFor({ email: 'ex@loja.com', profiles: perfis })).toBeNull();
    });

    it('a equipe da loja lista o titular como gestor e só os atendentes ativos dela', async () => {
        const equipe = await membrosDaLoja(fakes.stores.docs[0]);
        expect(equipe).toEqual([
            { email: 'dono@loja.com', name: 'Dono', role: 'gestor' },
            { email: 'ana@loja.com', name: 'Ana', role: 'atendente' },
        ]);
    });
});
