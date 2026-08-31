import { actualServiceDate, addEasternDays, assertEasternServiceDate, type EasternServiceDate } from '@/lib/service-cycle/dates';

export type ServiceDay = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';
export type RecoveryReviewReason =
    | 'missing_stripe_evidence' | 'unknown_price' | 'missing_anchor' | 'midnight_boundary'
    | 'weekday_mismatch' | 'cadence_mismatch' | 'period_mismatch' | 'route_history_disagreement'
    | 'completion_chronology_conflict' | 'normalized_collision' | 'duplicate_completion' | 'contradictory_evidence'
    | 'stripe_status_mismatch';

export interface RecoverySubscription {
    id: string;
    status: string;
    serviceDay: ServiceDay | null;
    frequencyDays: number;
    currentPeriodEnd: string | null;
    serviceCycleAnchor: string | null;
}

export interface RecoveryHistory {
    id: string;
    serviceDate: string;
    dispatchStatus: string;
    completedAt?: string | null;
    cycleDueDate?: string | null;
    serviceCycleId?: string | null;
}

export interface RecoveryStop {
    id: string;
    serviceHistoryId: string;
    serviceDate: string;
    dispatchStatus: string;
    cycleDueDate?: string | null;
    serviceCycleId?: string | null;
}

export interface StripeSubscriptionEvidence {
    /** Stripe's subscription lifecycle state, retained without customer or payment data. */
    status: string;
    billingCycleAnchor: string | null;
    currentPeriodEnd: string | null;
    recurringPrice: { id: string; intervalDays: number } | null;
}

/** Narrow seam: callers supply only the operational Stripe evidence required by Ticket 04. */
export interface StripeSubscriptionEvidenceProvider {
    getEvidence(stripeSubscriptionId: string): Promise<StripeSubscriptionEvidence | null>;
}

export type RecoveryClassification =
    | { status: 'verified'; anchor: EasternServiceDate; reason: null }
    | { status: 'needs_review'; anchor: null; reason: RecoveryReviewReason };

export interface NormalizeHistoricalServiceDateInput {
    value: string;
    linkedValues: readonly string[];
    existingCanonicalDates: readonly string[];
}

export type NormalizationDecision =
    | { status: 'canonical'; normalizedDate: EasternServiceDate; reason: null }
    | { status: 'normalized'; normalizedDate: EasternServiceDate; reason: null }
    | { status: 'needs_review'; normalizedDate: null; reason: RecoveryReviewReason };

const serviceDays: ServiceDay[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function isCanonical(value: string): value is EasternServiceDate {
    try {
        assertEasternServiceDate(value);
        return true;
    } catch {
        return false;
    }
}

function easternDateFromTimestamp(value: string): EasternServiceDate | null {
    if (!/T/.test(value)) return null;
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? null : actualServiceDate(instant);
}

function isUtcMidnight(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(value);
}

function serviceDayForDate(date: EasternServiceDate): ServiceDay {
    return serviceDays[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
}

function classifyReview(reason: RecoveryReviewReason): RecoveryClassification {
    return { status: 'needs_review', anchor: null, reason };
}

function stripeStatusMatchesLocal(localStatus: string, stripeStatus: string): boolean {
    if (localStatus === 'active') return stripeStatus === 'active' || stripeStatus === 'trialing';
    if (localStatus === 'canceled' || localStatus === 'cancelled') return stripeStatus === 'canceled';
    return localStatus === stripeStatus;
}

export function normalizeHistoricalServiceDate(input: NormalizeHistoricalServiceDateInput): NormalizationDecision {
    if (isCanonical(input.value)) return { status: 'canonical', normalizedDate: input.value, reason: null };
    if (isUtcMidnight(input.value)) return { status: 'needs_review', normalizedDate: null, reason: 'midnight_boundary' };
    const normalizedDate = easternDateFromTimestamp(input.value);
    if (!normalizedDate) return { status: 'needs_review', normalizedDate: null, reason: 'contradictory_evidence' };

    const linkedDates = input.linkedValues.map((value) => isCanonical(value) ? value : easternDateFromTimestamp(value));
    if (linkedDates.some((date) => date !== normalizedDate)) {
        return { status: 'needs_review', normalizedDate: null, reason: 'route_history_disagreement' };
    }
    if (input.existingCanonicalDates.includes(normalizedDate)) {
        return { status: 'needs_review', normalizedDate: null, reason: 'normalized_collision' };
    }
    return { status: 'normalized', normalizedDate, reason: null };
}

export function classifyServiceCycleRecovery(input: {
    subscription: RecoverySubscription;
    stripe: StripeSubscriptionEvidence | null;
    history: readonly RecoveryHistory[];
    stops: readonly RecoveryStop[];
}): RecoveryClassification {
    const { subscription, stripe, history, stops } = input;
    if (!stripe) return classifyReview('missing_stripe_evidence');
    if (!stripe.recurringPrice) return classifyReview('unknown_price');
    if (!stripeStatusMatchesLocal(subscription.status, stripe.status)) return classifyReview('stripe_status_mismatch');
    if (!stripe.billingCycleAnchor) return classifyReview('missing_anchor');
    if (!subscription.serviceDay) return classifyReview('missing_anchor');
    if (stripe.recurringPrice.intervalDays !== subscription.frequencyDays) return classifyReview('cadence_mismatch');

    const anchor = easternDateFromTimestamp(stripe.billingCycleAnchor);
    if (!anchor) return classifyReview('missing_anchor');
    if (subscription.serviceCycleAnchor && (!isCanonical(subscription.serviceCycleAnchor) || subscription.serviceCycleAnchor !== anchor)) {
        return classifyReview('contradictory_evidence');
    }
    if (serviceDayForDate(anchor) !== subscription.serviceDay) return classifyReview('weekday_mismatch');
    if (!subscription.currentPeriodEnd || !stripe.currentPeriodEnd) return classifyReview('missing_stripe_evidence');
    const localPeriodEnd = easternDateFromTimestamp(subscription.currentPeriodEnd);
    const stripePeriodEnd = easternDateFromTimestamp(stripe.currentPeriodEnd);
    if (!localPeriodEnd || !stripePeriodEnd || localPeriodEnd !== stripePeriodEnd || daysBetween(anchor, localPeriodEnd) % subscription.frequencyDays !== 0) {
        return classifyReview('period_mismatch');
    }

    const historyById = new Map(history.map((record) => [record.id, record]));
    for (const stop of stops) {
        const historyRecord = historyById.get(stop.serviceHistoryId);
        if (!historyRecord || stop.serviceDate !== historyRecord.serviceDate) return classifyReview('route_history_disagreement');
    }
    const completedDates = new Set<string>();
    for (const record of history.filter((item) => item.dispatchStatus === 'Completed')) {
        if (completedDates.has(record.serviceDate)) return classifyReview('duplicate_completion');
        completedDates.add(record.serviceDate);
        if (!isCanonical(record.serviceDate)) return classifyReview('contradictory_evidence');
        if (record.completedAt) {
            const completedDate = easternDateFromTimestamp(record.completedAt);
            if (!completedDate || completedDate < record.serviceDate) return classifyReview('completion_chronology_conflict');
        }
    }
    return { status: 'verified', anchor, reason: null };
}

function daysBetween(start: EasternServiceDate, end: EasternServiceDate): number {
    return Math.round((Date.parse(`${end}T12:00:00.000Z`) - Date.parse(`${start}T12:00:00.000Z`)) / 86_400_000);
}

export type BackfillOperation =
    | { kind: 'set_anchor'; idempotencyKey: string; beforeState: string | null; expectedCounts: { subscriptions: number }; inverse: { kind: 'restore_anchor'; value: string | null } }
    | { kind: 'create_cycle'; idempotencyKey: string; cycleDueDate: EasternServiceDate; beforeState: null; expectedCounts: { serviceCycles: number; events: number }; inverse: { kind: 'delete_created_cycle' } }
    | { kind: 'fulfill_cycle'; idempotencyKey: string; cycleDueDate: EasternServiceDate; evidenceHistoryId: string; beforeState: 'open'; expectedCounts: { serviceCycles: number; events: number }; inverse: { kind: 'restore_open_cycle' } };

export interface BackfillPlan {
    subscriptionId: string;
    operations: BackfillOperation[];
}

export interface BackfillExecutionStore {
    /** Confirms the operation's recorded before-state and exact expected counts before a write. */
    assertBeforeState(operation: BackfillOperation): Promise<void>;
    apply(operation: BackfillOperation): Promise<void>;
    /** Reads back the affected records and confirms the operation's exact expected counts. */
    verify(operation: BackfillOperation): Promise<void>;
    /** Applies the operation's precomputed inverse; used only after an apply attempt. */
    repair(operation: BackfillOperation): Promise<void>;
}

export async function executeBackfillPlan(
    plan: BackfillPlan,
    store: BackfillExecutionStore,
    options: { dryRun?: boolean } = {},
): Promise<{ mode: 'dry_run' | 'applied'; operationCount: number }> {
    const dryRun = options.dryRun ?? true;
    const keys = new Set<string>();
    for (const operation of plan.operations) {
        if (keys.has(operation.idempotencyKey)) throw new Error(`Duplicate backfill idempotency key: ${operation.idempotencyKey}`);
        keys.add(operation.idempotencyKey);
        await store.assertBeforeState(operation);
    }
    if (dryRun) return { mode: 'dry_run', operationCount: plan.operations.length };

    const applied: BackfillOperation[] = [];
    try {
        for (const operation of plan.operations) {
            await store.apply(operation);
            applied.push(operation);
            await store.verify(operation);
        }
    } catch (error) {
        for (const operation of [...applied].reverse()) await store.repair(operation);
        throw error;
    }
    return { mode: 'applied', operationCount: plan.operations.length };
}

export function buildBackfillPlan(input: {
    classification: RecoveryClassification;
    subscription: RecoverySubscription;
    history: readonly RecoveryHistory[];
    stops: readonly RecoveryStop[];
    throughDate: string;
}): BackfillPlan {
    if (input.classification.status !== 'verified') throw new Error('A verified anchor is required before planning a backfill');
    assertEasternServiceDate(input.throughDate);
    const operations: BackfillOperation[] = [];
    const prefix = `service-cycle-recovery:${input.subscription.id}`;
    if (!input.subscription.serviceCycleAnchor) {
        operations.push({ kind: 'set_anchor', idempotencyKey: `${prefix}:anchor:${input.classification.anchor}`, beforeState: null, expectedCounts: { subscriptions: 1 }, inverse: { kind: 'restore_anchor', value: null } });
    }
    for (let dueDate = input.classification.anchor; dueDate <= input.throughDate; dueDate = addEasternDays(dueDate, input.subscription.frequencyDays)) {
        operations.push({ kind: 'create_cycle', idempotencyKey: `${prefix}:cycle:${dueDate}`, cycleDueDate: dueDate, beforeState: null, expectedCounts: { serviceCycles: 1, events: 1 }, inverse: { kind: 'delete_created_cycle' } });
        const completion = input.history.find((record) => record.dispatchStatus === 'Completed' && record.serviceDate === dueDate);
        if (completion) operations.push({ kind: 'fulfill_cycle', idempotencyKey: `${prefix}:fulfill:${dueDate}`, cycleDueDate: dueDate, evidenceHistoryId: completion.id, beforeState: 'open', expectedCounts: { serviceCycles: 1, events: 1 }, inverse: { kind: 'restore_open_cycle' } });
    }
    return { subscriptionId: input.subscription.id, operations };
}
