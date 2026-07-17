import { describe, expect, it } from 'vitest';
import { canIaAct, computeIaResumeAt, isBusinessHours } from '@/lib/utils/iaSchedule';

// Horário local de São Paulo = UTC-3 (sem horário de verão).
// Helper: cria um Date a partir do relógio de parede de São Paulo.
const spTime = (iso: string) => new Date(new Date(iso + 'Z').getTime() + 3 * 60 * 60 * 1000);

describe('computeIaResumeAt', () => {
    it('dentro do horário comercial volta 1h depois', () => {
        const resume = computeIaResumeAt(spTime('2026-07-17T10:00:00'));
        expect(resume.toISOString()).toBe(spTime('2026-07-17T11:00:00').toISOString());
    });

    it('às 17h volta exatamente às 18h (limite do expediente)', () => {
        const resume = computeIaResumeAt(spTime('2026-07-17T17:00:00'));
        expect(resume.toISOString()).toBe(spTime('2026-07-17T18:00:00').toISOString());
    });

    it('às 17h30 a retomada estouraria o expediente: vai para 09h do dia seguinte', () => {
        const resume = computeIaResumeAt(spTime('2026-07-17T17:30:00'));
        expect(resume.toISOString()).toBe(spTime('2026-07-18T09:00:00').toISOString());
    });

    it('após as 18h aguarda até as 09h (08h + 1h) do dia seguinte', () => {
        const resume = computeIaResumeAt(spTime('2026-07-17T19:00:00'));
        expect(resume.toISOString()).toBe(spTime('2026-07-18T09:00:00').toISOString());
    });

    it('perto da meia-noite ainda cai nas 09h do dia seguinte', () => {
        const resume = computeIaResumeAt(spTime('2026-07-17T23:30:00'));
        expect(resume.toISOString()).toBe(spTime('2026-07-18T09:00:00').toISOString());
    });

    it('antes das 08h aguarda até as 09h do mesmo dia', () => {
        const resume = computeIaResumeAt(spTime('2026-07-17T07:00:00'));
        expect(resume.toISOString()).toBe(spTime('2026-07-17T09:00:00').toISOString());
    });

    it('atravessa a virada de mês corretamente', () => {
        const resume = computeIaResumeAt(spTime('2026-07-31T20:00:00'));
        expect(resume.toISOString()).toBe(spTime('2026-08-01T09:00:00').toISOString());
    });
});

describe('canIaAct', () => {
    const now = spTime('2026-07-17T10:00:00');

    it('sem pausa registrada a IA está livre', () => {
        expect(canIaAct(null, now)).toBe(true);
        expect(canIaAct(undefined, now)).toBe(true);
    });

    it('pausada até um horário futuro, não pode atuar', () => {
        expect(canIaAct(spTime('2026-07-17T11:00:00'), now)).toBe(false);
    });

    it('com a retomada já vencida, pode atuar', () => {
        expect(canIaAct(spTime('2026-07-17T09:30:00'), now)).toBe(true);
    });
});

describe('isBusinessHours', () => {
    it('10h é horário comercial', () => {
        expect(isBusinessHours(spTime('2026-07-17T10:00:00'))).toBe(true);
    });

    it('08h em ponto já é horário comercial', () => {
        expect(isBusinessHours(spTime('2026-07-17T08:00:00'))).toBe(true);
    });

    it('07h59 e 18h em diante não são', () => {
        expect(isBusinessHours(spTime('2026-07-17T07:59:00'))).toBe(false);
        expect(isBusinessHours(spTime('2026-07-17T18:00:00'))).toBe(false);
        expect(isBusinessHours(spTime('2026-07-17T22:00:00'))).toBe(false);
    });
});
