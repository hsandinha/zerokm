import { describe, expect, it } from 'vitest';
import { periodFilter, resolvePeriod } from '@/lib/utils/period';

// São Paulo é UTC-3 e não tem mais horário de verão desde 2019.
const spDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

describe('resolvePeriod', () => {
    // 02:00 UTC de 10/03 ainda é 23:00 de 09/03 em São Paulo. Se usássemos a data do
    // servidor (UTC em produção), "hoje" começaria no dia errado.
    const lateNight = new Date('2026-03-10T02:00:00Z');

    it('usa o dia do fuso de São Paulo, não o do servidor', () => {
        const period = resolvePeriod('day', null, null, lateNight);

        expect(spDay(period.from!.toISOString())).toBe('2026-03-09');
        expect(period.from!.toISOString()).toBe('2026-03-09T03:00:00.000Z');
        expect(period.to!.toISOString()).toBe('2026-03-10T03:00:00.000Z');
    });

    it('mês vai do dia 1 local até o dia 1 do mês seguinte', () => {
        const period = resolvePeriod('month', null, null, lateNight);

        expect(period.from!.toISOString()).toBe('2026-03-01T03:00:00.000Z');
        expect(period.to!.toISOString()).toBe('2026-04-01T03:00:00.000Z');
    });

    it('semana começa na segunda e dura sete dias', () => {
        const period = resolvePeriod('week', null, null, lateNight);

        const inicioLocal = new Date(period.from!.getTime() - 3 * 3600 * 1000);
        expect(inicioLocal.getUTCDay()).toBe(1); // segunda-feira
        expect(period.to!.getTime() - period.from!.getTime()).toBe(7 * 24 * 3600 * 1000);
    });

    it('período personalizado inclui o dia final inteiro', () => {
        const period = resolvePeriod('custom', '2026-03-01', '2026-03-05');

        expect(period.from!.toISOString()).toBe('2026-03-01T03:00:00.000Z');
        // Limite superior exclusivo: 06/03 00:00 local cobre o dia 05 inteiro.
        expect(period.to!.toISOString()).toBe('2026-03-06T03:00:00.000Z');
    });

    it('custom sem datas e preset desconhecido caem em "todo o período"', () => {
        expect(resolvePeriod('custom', null, null)).toEqual({ preset: 'all', from: null, to: null });
        expect(resolvePeriod('all')).toEqual({ preset: 'all', from: null, to: null });
        expect(resolvePeriod(null)).toEqual({ preset: 'all', from: null, to: null });
    });
});

describe('periodFilter', () => {
    it('não filtra nada em "todo o período"', () => {
        expect(periodFilter({ preset: 'all', from: null, to: null })).toEqual({});
    });

    it('monta um intervalo semiaberto [from, to)', () => {
        const from = new Date('2026-03-01T03:00:00Z');
        const to = new Date('2026-03-06T03:00:00Z');

        expect(periodFilter({ preset: 'custom', from, to })).toEqual({ createdAt: { $gte: from, $lt: to } });
    });
});
