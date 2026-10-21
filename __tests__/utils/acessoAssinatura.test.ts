import { describe, expect, it } from 'vitest';
import { acessoBloqueado, emTolerancia, inicioDoBloqueio } from '@/lib/utils/acessoAssinatura';

// Vencimento como o CRM grava: meio-dia UTC (9h em Brasília) de 21/10.
const VENCE = new Date('2026-10-21T12:00:00Z');

describe('bloqueio da assinatura', () => {
    it('bloqueia à 0h de Brasília do dia seguinte ao vencimento', () => {
        expect(inicioDoBloqueio(VENCE).toISOString()).toBe('2026-10-22T03:00:00.000Z');
    });

    it('no dia do vencimento o cliente ainda entra', () => {
        expect(acessoBloqueado(VENCE, new Date('2026-10-21T12:30:00Z'))).toBe(false); // 9h30 em Brasília
        expect(acessoBloqueado(VENCE, new Date('2026-10-22T02:59:00Z'))).toBe(false); // 23h59 em Brasília
        expect(emTolerancia(VENCE, new Date('2026-10-21T20:00:00Z'))).toBe(true);
    });

    it('no dia seguinte bloqueia', () => {
        expect(acessoBloqueado(VENCE, new Date('2026-10-22T03:00:00Z'))).toBe(true);
        expect(emTolerancia(VENCE, new Date('2026-10-22T10:00:00Z'))).toBe(false);
    });

    it('antes do vencimento não é tolerância nem bloqueio', () => {
        expect(acessoBloqueado(VENCE, new Date('2026-10-20T12:00:00Z'))).toBe(false);
        expect(emTolerancia(VENCE, new Date('2026-10-20T12:00:00Z'))).toBe(false);
        expect(acessoBloqueado(null)).toBe(false);
    });
});
