import { actualServiceDate, assertEasternServiceDate, firstServiceDayOnOrAfter, type EasternServiceDate } from '@/lib/service-cycle/dates';

const SUPPORTED_CADENCES = new Set([28, 56, 84]);

export interface PaymentFailureCycleSubscription {
    id: string;
    frequencyDays: number;
    serviceCycleAnchor: string | null;
    serviceDay: string | null;
}

/**
 * Normalizes a Stripe invoice period boundary to a local Service Date only
 * when that date is already a canonical, anchor-aligned Service Cycle. This
 * deliberately declines to create an obligation for non-service-day billing
 * boundaries or incomplete local cycle evidence.
 */
export function resolvePaymentFailureCycleDueDate(
    subscription: PaymentFailureCycleSubscription | null,
    billingPeriodStartSeconds: number | null,
): EasternServiceDate | null {
    if (!subscription || !Number.isFinite(billingPeriodStartSeconds) || !SUPPORTED_CADENCES.has(subscription.frequencyDays)) return null;
    if (!subscription.serviceCycleAnchor || !subscription.serviceDay) return null;

    try {
        assertEasternServiceDate(subscription.serviceCycleAnchor);
        if (firstServiceDayOnOrAfter(subscription.serviceCycleAnchor, subscription.serviceDay) !== subscription.serviceCycleAnchor) return null;
    } catch {
        return null;
    }

    const periodStartSeconds = billingPeriodStartSeconds as number;
    const dueDate = actualServiceDate(new Date(periodStartSeconds * 1000));
    if (firstServiceDayOnOrAfter(dueDate, subscription.serviceDay) !== dueDate) return null;

    const daysSinceAnchor = Math.round((Date.parse(`${dueDate}T12:00:00.000Z`) - Date.parse(`${subscription.serviceCycleAnchor}T12:00:00.000Z`)) / 86_400_000);
    return daysSinceAnchor >= 0 && daysSinceAnchor % subscription.frequencyDays === 0 ? dueDate : null;
}
