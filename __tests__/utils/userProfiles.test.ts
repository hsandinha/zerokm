import { describe, expect, it } from 'vitest';
import { toggleProfileSelection, isClientOnly } from '@/lib/utils/userProfiles';
import type { UserProfile } from '@/lib/types/auth';

const p = (...xs: string[]) => xs as UserProfile[];

describe('toggleProfileSelection', () => {
    it('troca dentro do grupo diretivo em vez de acumular', () => {
        expect(toggleProfileSelection(p('administrador'), 'gerente' as UserProfile)).toEqual(['gerente']);
    });

    it('troca dentro do grupo operacional', () => {
        expect(toggleProfileSelection(p('operador', 'cliente'), 'vendedor' as UserProfile)).toEqual(['cliente', 'vendedor']);
    });

    it('cliente e gratis são mutuamente exclusivos', () => {
        expect(toggleProfileSelection(p('gratis'), 'cliente' as UserProfile)).toEqual(['cliente']);
    });

    it('clicar no perfil já ativo remove', () => {
        expect(toggleProfileSelection(p('operador'), 'operador' as UserProfile)).toEqual([]);
    });

    it('grupos diferentes convivem', () => {
        const out = toggleProfileSelection(p('administrador'), 'operador' as UserProfile);
        expect(out.sort()).toEqual(['administrador', 'operador']);
    });

    it('perfil fora dos grupos alterna livremente', () => {
        expect(toggleProfileSelection(p('operador'), 'concessionaria' as UserProfile).sort()).toEqual(['concessionaria', 'operador']);
        expect(toggleProfileSelection(p('operador', 'concessionaria'), 'concessionaria' as UserProfile)).toEqual(['operador']);
    });
});

describe('isClientOnly', () => {
    it('cliente puro e gratis puro são clientes', () => {
        expect(isClientOnly(['cliente'])).toBe(true);
        expect(isClientOnly(['gratis'])).toBe(true);
    });

    it('quem também é equipe não é cliente puro', () => {
        expect(isClientOnly(['cliente', 'operador'])).toBe(false);
        expect(isClientOnly(['administrador'])).toBe(false);
    });

    it('sem perfis não classifica como cliente (usuário legado fica na Equipe)', () => {
        expect(isClientOnly([])).toBe(false);
        expect(isClientOnly(undefined)).toBe(false);
    });
});
