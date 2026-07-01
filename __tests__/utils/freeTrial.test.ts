import { describe, expect, it } from 'vitest';
import { createExpiredFreeTrialWindow, createFreeTrialWindow, createRenewedFreeTrialWindow, FREE_TRIAL_DURATION_MS, isFreeTrialExpired } from '@/lib/utils/freeTrial';

describe('freeTrial utils', () => {
    it('creates a 24 hour free trial window', () => {
        const now = new Date('2026-05-26T12:00:00.000Z');
        const trial = createFreeTrialWindow(now);

        expect(trial.freeTrialStartedAt).toEqual(now);
        expect(trial.freeTrialExpiresAt.getTime() - now.getTime()).toBe(FREE_TRIAL_DURATION_MS);
        expect(FREE_TRIAL_DURATION_MS).toBe(24 * 60 * 60 * 1000);
    });

    it('detects expired and active trial windows', () => {
        const now = new Date('2026-05-27T12:00:00.000Z');

        expect(isFreeTrialExpired('2026-05-27T11:59:59.000Z', now)).toBe(true);
        expect(isFreeTrialExpired('2026-05-27T12:00:01.000Z', now)).toBe(false);
        expect(isFreeTrialExpired(null, now)).toBe(false);
    });

    it('creates an already expired window for legacy free users', () => {
        const now = new Date('2026-05-26T12:10:00.000Z');
        const trial = createExpiredFreeTrialWindow(now);

        expect(trial.freeTrialExpiresAt).toEqual(now);
        expect(isFreeTrialExpired(trial.freeTrialExpiresAt, now)).toBe(true);
    });

    it('renews a free trial for another 24h from now', () => {
        const now = new Date('2026-06-15T10:00:00.000Z');
        const trial = createRenewedFreeTrialWindow(now);

        expect(trial.freeTrialStartedAt).toEqual(now);
        expect(trial.freeTrialExpiresAt.getTime() - now.getTime()).toBe(FREE_TRIAL_DURATION_MS);
        expect(isFreeTrialExpired(trial.freeTrialExpiresAt, now)).toBe(false);

        // Should be expired 24h+1ms later
        const later = new Date(now.getTime() + FREE_TRIAL_DURATION_MS + 1);
        expect(isFreeTrialExpired(trial.freeTrialExpiresAt, later)).toBe(true);
    });
});
