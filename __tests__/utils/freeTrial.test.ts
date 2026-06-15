import { describe, expect, it } from 'vitest';
import { createExpiredFreeTrialWindow, createFreeTrialWindow, FREE_TRIAL_DURATION_MS, isFreeTrialExpired } from '@/lib/utils/freeTrial';

describe('freeTrial utils', () => {
    it('creates a 10 minute free trial window', () => {
        const now = new Date('2026-05-26T12:00:00.000Z');
        const trial = createFreeTrialWindow(now);

        expect(trial.freeTrialStartedAt).toEqual(now);
        expect(trial.freeTrialExpiresAt.getTime() - now.getTime()).toBe(FREE_TRIAL_DURATION_MS);
    });

    it('detects expired and active trial windows', () => {
        const now = new Date('2026-05-26T12:10:00.000Z');

        expect(isFreeTrialExpired('2026-05-26T12:09:59.000Z', now)).toBe(true);
        expect(isFreeTrialExpired('2026-05-26T12:10:01.000Z', now)).toBe(false);
        expect(isFreeTrialExpired(null, now)).toBe(false);
    });

    it('creates an already expired window for legacy free users', () => {
        const now = new Date('2026-05-26T12:10:00.000Z');
        const trial = createExpiredFreeTrialWindow(now);

        expect(trial.freeTrialExpiresAt).toEqual(now);
        expect(isFreeTrialExpired(trial.freeTrialExpiresAt, now)).toBe(true);
    });
});
