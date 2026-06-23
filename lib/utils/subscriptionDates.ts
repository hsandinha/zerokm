const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses the calendar date sent by the CRM date input without letting the
 * server timezone shift the selected day. Noon UTC remains the same calendar
 * day for the Brazilian timezones used by the admin panel.
 */
export function parseSubscriptionStartDate(value: unknown): Date | null {
    if (typeof value !== 'string') return null;

    const match = DATE_INPUT_PATTERN.exec(value);
    if (!match) return null;

    const [, yearValue, monthValue, dayValue] = match;
    const year = Number(yearValue);
    const month = Number(monthValue);
    const day = Number(dayValue);
    const date = new Date(Date.UTC(year, month - 1, day, 12));

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }

    return date;
}

export function calculateSubscriptionExpiry(startDate: Date, durationDays: number): Date {
    const expiresAt = new Date(startDate);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + durationDays);
    return expiresAt;
}
