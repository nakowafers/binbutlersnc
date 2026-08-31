import { addEasternDays, assertEasternServiceDate, type EasternServiceDate } from '@/lib/service-cycle/dates';

export type ServiceCycleShadowDifferenceKind = 'missing' | 'extra' | 'date_shifted' | 'review_required';
export interface ServiceCycleShadowSubscription { subscriptionId: string; frequencyDays: number; serviceCycleAnchor: string | null; completedServiceDates?: readonly string[]; }
export interface ServiceCycleShadowDifference { subscriptionId: string; kind: ServiceCycleShadowDifferenceKind; expectedCycleDueDate: string | null; }
export interface ServiceCycleShadowParityReport { targetCycleDueDate: string; differences: ServiceCycleShadowDifference[]; malformedCompletionValueCount: number; }

function isCanonicalDate(value: string): value is EasternServiceDate {
    try { assertEasternServiceDate(value); return true; } catch { return false; }
}

function expectedDueDate(anchor: EasternServiceDate, target: EasternServiceDate, frequencyDays: number): EasternServiceDate {
    const days = Math.floor((Date.parse(`${target}T12:00:00.000Z`) - Date.parse(`${anchor}T12:00:00.000Z`)) / 86_400_000);
    return addEasternDays(anchor, Math.floor(days / frequencyDays) * frequencyDays);
}

function dayDistance(left: string, right: string): number {
    return Math.abs((Date.parse(`${left}T12:00:00.000Z`) - Date.parse(`${right}T12:00:00.000Z`)) / 86_400_000);
}

/** PII-free shadow comparison. Completion values are diagnostics only and never move the stable anchor. */
export function buildCycleShadowParityReport(input: { targetCycleDueDate: string; legacySelectedSubscriptionIds: readonly string[]; subscriptions: readonly ServiceCycleShadowSubscription[] }): ServiceCycleShadowParityReport {
    assertEasternServiceDate(input.targetCycleDueDate);
    const target = input.targetCycleDueDate as EasternServiceDate;
    const legacySelected = new Set(input.legacySelectedSubscriptionIds);
    const differences: ServiceCycleShadowDifference[] = [];
    let malformedCompletionValueCount = 0;
    for (const subscription of input.subscriptions) {
        malformedCompletionValueCount += (subscription.completedServiceDates || []).filter((value) => !isCanonicalDate(value)).length;
        if (![28, 56, 84].includes(subscription.frequencyDays) || !subscription.serviceCycleAnchor || !isCanonicalDate(subscription.serviceCycleAnchor)) {
            differences.push({ subscriptionId: subscription.subscriptionId, kind: 'review_required', expectedCycleDueDate: null });
            continue;
        }
        const expected = expectedDueDate(subscription.serviceCycleAnchor, target, subscription.frequencyDays);
        const shadowSelects = expected === target;
        const legacySelects = legacySelected.has(subscription.subscriptionId);
        if (shadowSelects && !legacySelects) differences.push({ subscriptionId: subscription.subscriptionId, kind: 'missing', expectedCycleDueDate: expected });
        else if (!shadowSelects && legacySelects) differences.push({ subscriptionId: subscription.subscriptionId, kind: dayDistance(expected, target) <= 6 ? 'date_shifted' : 'extra', expectedCycleDueDate: expected });
    }
    return { targetCycleDueDate: input.targetCycleDueDate, differences, malformedCompletionValueCount };
}
