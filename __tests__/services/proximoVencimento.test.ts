import { describe, expect, it } from 'vitest';
import { proximoVencimento } from '@/lib/services/assinaturaPagamento';

const AGORA = new Date('2026-10-21T12:00:00Z');

describe('próximo vencimento na baixa manual', () => {
    it('pagou adiantado: conta do vencimento atual, sem perder dias', () => {
        expect(proximoVencimento('2026-10-25T12:00:00Z', 'monthly', AGORA).toISOString()).toBe('2026-11-24T12:00:00.000Z');
    });

    it('pagou atrasado: mantém o dia do vencimento', () => {
        expect(proximoVencimento('2026-10-19T12:00:00Z', 'monthly', AGORA).toISOString()).toBe('2026-11-18T12:00:00.000Z');
    });

    it('mais de um período sem pagar: recomeça de hoje', () => {
        expect(proximoVencimento('2026-07-01T12:00:00Z', 'monthly', AGORA).toISOString()).toBe('2026-11-20T12:00:00.000Z');
    });

    it('sem vencimento anterior: a partir de hoje; anual soma um ano', () => {
        expect(proximoVencimento(null, 'monthly', AGORA).toISOString()).toBe('2026-11-20T12:00:00.000Z');
        expect(proximoVencimento('2026-10-25T12:00:00Z', 'annual', AGORA).toISOString()).toBe('2027-10-25T12:00:00.000Z');
    });
});
