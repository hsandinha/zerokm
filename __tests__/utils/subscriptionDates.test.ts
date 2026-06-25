import { describe, expect, it } from 'vitest';
import { calculateSubscriptionExpiry, parseSubscriptionStartDate } from '@/lib/utils/subscriptionDates';

describe('subscription date utilities', () => {
    it('parses a date-input value without timezone drift', () => {
        expect(parseSubscriptionStartDate('2026-06-10')?.toISOString()).toBe('2026-06-10T12:00:00.000Z');
    });

    it('rejects malformed and impossible start dates', () => {
        expect(parseSubscriptionStartDate('10/06/2026')).toBeNull();
        expect(parseSubscriptionStartDate('2026-02-30')).toBeNull();
        expect(parseSubscriptionStartDate(null)).toBeNull();
    });

    it('calculates the expiration from the selected start date', () => {
        const startDate = parseSubscriptionStartDate('2026-06-10')!;

        expect(calculateSubscriptionExpiry(startDate, 30).toISOString()).toBe('2026-07-10T12:00:00.000Z');
        expect(calculateSubscriptionExpiry(startDate, 365).toISOString()).toBe('2027-06-10T12:00:00.000Z');
    });
});
