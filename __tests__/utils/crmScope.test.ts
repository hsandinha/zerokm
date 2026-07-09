import { describe, expect, it, vi, beforeEach } from 'vitest';

const findOne = vi.fn();
vi.mock('@/models/User', () => ({ default: { findOne: (...args: any[]) => findOne(...args) } }));

import { resolveCrmScope } from '@/lib/utils/crmScope';
import Lead from '@/models/Lead';

const sessionFor = (profile: string, email = 'a@b.com') =>
    ({ user: { email, profile } } as any);

describe('resolveCrmScope', () => {
    beforeEach(() => findOne.mockReset());

    it.each(['admin', 'administrador', 'marketing'])('escopa %s no pipeline global', async (profile) => {
        const scope = await resolveCrmScope(sessionFor(profile));

        expect(scope).toEqual({ ok: true, concessionariaId: null });
    });

    it.each(['concessionaria', 'dealership'])('escopa %s na própria concessionária', async (profile) => {
        findOne.mockResolvedValue({ dealershipId: '507f1f77bcf86cd799439011' });

        const scope = await resolveCrmScope(sessionFor(profile));

        expect(scope).toEqual({ ok: true, concessionariaId: '507f1f77bcf86cd799439011' });
    });

    it('rejeita concessionária sem vínculo', async () => {
        findOne.mockResolvedValue({ dealershipId: undefined });

        expect(await resolveCrmScope(sessionFor('dealership'))).toMatchObject({ ok: false, status: 400 });
    });

    it('rejeita sessão ausente e perfil sem acesso', async () => {
        expect(await resolveCrmScope(null)).toMatchObject({ ok: false, status: 401 });
        expect(await resolveCrmScope(sessionFor('vendedor'))).toMatchObject({ ok: false, status: 403 });
    });
});

describe('regressão: escopo nunca vaza leads entre concessionárias', () => {
    beforeEach(() => findOne.mockReset());

    // O escopo global tem que ser `null` explícito. Com `undefined`, a chave só sobrevive
    // ao filtro porque a conexão usa o default `ignoreUndefined: false`; sob
    // `ignoreUndefined: true` ela some, o filtro vira `{ ativo: true }` e o admin passa a
    // enxergar os leads de todas as concessionárias.
    it('mantém concessionariaId no filtro do pipeline global', async () => {
        const scope = await resolveCrmScope(sessionFor('admin'));
        if (!scope.ok) throw new Error('escopo deveria ser válido');

        const filter = Lead.find({ concessionariaId: scope.concessionariaId, ativo: true }).getFilter();

        expect(filter).toEqual({ concessionariaId: null, ativo: true });
    });

    it('mantém concessionariaId no filtro da concessionária', async () => {
        findOne.mockResolvedValue({ dealershipId: '507f1f77bcf86cd799439011' });
        const scope = await resolveCrmScope(sessionFor('dealership'));
        if (!scope.ok) throw new Error('escopo deveria ser válido');

        const filter = Lead.find({ concessionariaId: scope.concessionariaId, ativo: true }).getFilter();

        expect(filter.concessionariaId).toBeDefined();
    });
});
