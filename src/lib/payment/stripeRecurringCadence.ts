const SUPPORTED_SERVICE_CADENCES = new Set([28, 56, 84]);

/** Normalize Stripe day/week recurrence into the service domain's exact-day cadence. */
export function stripeRecurringCadenceDays(recurring: {
    interval?: string | null;
    interval_count?: number | null;
} | null | undefined): number | null {
    const count = recurring?.interval_count;
    if (!Number.isInteger(count) || !count || count < 1) return null;
    const days = recurring?.interval === 'day' ? count : recurring?.interval === 'week' ? count * 7 : null;
    return days !== null && SUPPORTED_SERVICE_CADENCES.has(days) ? days : null;
}
