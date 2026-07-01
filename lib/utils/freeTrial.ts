export const FREE_TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

export function createFreeTrialWindow(now = new Date()) {
    return {
        freeTrialStartedAt: now,
        freeTrialExpiresAt: new Date(now.getTime() + FREE_TRIAL_DURATION_MS),
    };
}

export function createExpiredFreeTrialWindow(now = new Date()) {
    return {
        freeTrialStartedAt: new Date(now.getTime() - FREE_TRIAL_DURATION_MS),
        freeTrialExpiresAt: now,
    };
}

/** Renew the free trial for another 24h starting now. */
export function createRenewedFreeTrialWindow(now = new Date()) {
    return {
        freeTrialStartedAt: now,
        freeTrialExpiresAt: new Date(now.getTime() + FREE_TRIAL_DURATION_MS),
    };
}

export function isFreeTrialExpired(expiresAt?: Date | string | null, now = new Date()) {
    if (!expiresAt) return false;
    const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (Number.isNaN(expiry.getTime())) return false;
    return expiry.getTime() <= now.getTime();
}
