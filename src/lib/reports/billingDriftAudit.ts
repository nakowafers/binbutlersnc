/**
 * A read-only comparison of the local Subscription projection and Stripe's
 * authoritative subscription evidence. Callers must supply already-sanitized
 * identifiers; findings deliberately contain no customer or payment details.
 */
export type BillingDriftReason =
    | 'unknown_price'
    | 'ambiguous_price'
    | 'cadence_mismatch'
    | 'billing_anchor_weekday_mismatch'
    | 'local_service_day_mismatch'
    | 'period_end_mismatch'
    | 'stale_or_out_of_order_state'
    | 'missing_local_subscription'
    | 'missing_authoritative_evidence';

export interface BillingDriftLocalSubscription {
    subscriptionId: string;
    stripeSubscriptionId?: string | null;
    status: string;
    frequencyDays: number;
    currentPeriodEnd?: string | null;
    serviceCycleAnchor?: string | null;
    serviceDay?: string | null;
}

export interface BillingDriftRecurringPrice {
    id: string;
    intervalDays: number;
}

export interface BillingDriftStripeEvidence {
    status: string;
    billingCycleAnchor: string | null;
    currentPeriodEnd: string | null;
    recurringPrice: BillingDriftRecurringPrice | readonly BillingDriftRecurringPrice[] | null;
}

export interface BillingDriftFinding {
    subscriptionId: string;
    reasons: BillingDriftReason[];
}

export interface BillingDriftEvidenceProvider {
    getBillingDriftEvidence(stripeSubscriptionId: string): Promise<BillingDriftStripeEvidence | null>;
}

const SUPPORTED_CADENCES = new Set([28, 56, 84]);
const SERVICE_DAYS: Record<string, number> = {
    SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

function weekday(value: string | null | undefined): number | null {
    if (!value || Number.isNaN(Date.parse(value))) return null;
    return new Date(value).getUTCDay();
}

function serviceDay(value: string | null | undefined): number | null {
    return value ? SERVICE_DAYS[value.toUpperCase()] ?? null : null;
}

function recurringPrices(value: BillingDriftStripeEvidence['recurringPrice']): readonly BillingDriftRecurringPrice[] {
    if (value === null) return [];
    if (Array.isArray(value)) return value as readonly BillingDriftRecurringPrice[];
    return [value as BillingDriftRecurringPrice];
}

function lifecycleStatusMatches(localStatus: string, stripeStatus: string): boolean {
    if (localStatus === 'active') return stripeStatus === 'active' || stripeStatus === 'trialing';
    if (localStatus === 'canceled' || localStatus === 'cancelled') return stripeStatus === 'canceled';
    return localStatus === stripeStatus;
}

/**
 * Builds findings only; it never changes service cycles, service history,
 * Stripe billing state, or either anchor. A missing or malformed input is a
 * finding rather than an assumption, keeping callers fail-closed.
 */
export function buildBillingDriftAudit(
    localSubscriptions: readonly BillingDriftLocalSubscription[],
    stripeEvidenceBySubscriptionId: ReadonlyMap<string, BillingDriftStripeEvidence>,
): BillingDriftFinding[] {
    const findings: BillingDriftFinding[] = [];
    const localStripeIds = new Set<string>();

    for (const local of localSubscriptions) {
        const reasons: BillingDriftReason[] = [];
        if (!local.stripeSubscriptionId) {
            reasons.push('missing_authoritative_evidence');
        } else {
            localStripeIds.add(local.stripeSubscriptionId);
            const stripe = stripeEvidenceBySubscriptionId.get(local.stripeSubscriptionId);
            if (!stripe) {
                reasons.push('missing_authoritative_evidence');
            } else {
                const prices = recurringPrices(stripe.recurringPrice);
                if (prices.length > 1) {
                    reasons.push('ambiguous_price');
                } else if (prices.length === 0 || !prices[0].id || !SUPPORTED_CADENCES.has(prices[0].intervalDays)) {
                    reasons.push('unknown_price');
                } else if (local.frequencyDays !== prices[0].intervalDays) {
                    reasons.push('cadence_mismatch');
                }

                const billingAnchorWeekday = weekday(stripe.billingCycleAnchor);
                const localAnchorWeekday = weekday(local.serviceCycleAnchor);
                const localServiceDay = serviceDay(local.serviceDay);
                if (stripe.billingCycleAnchor && billingAnchorWeekday === null) {
                    reasons.push('missing_authoritative_evidence');
                } else if (billingAnchorWeekday !== null) {
                    if (localAnchorWeekday !== null && billingAnchorWeekday !== localAnchorWeekday) reasons.push('billing_anchor_weekday_mismatch');
                    if (localServiceDay !== null && billingAnchorWeekday !== localServiceDay) reasons.push('local_service_day_mismatch');
                }

                if (local.currentPeriodEnd && stripe.currentPeriodEnd) {
                    if (Date.parse(local.currentPeriodEnd) !== Date.parse(stripe.currentPeriodEnd)) reasons.push('period_end_mismatch');
                } else if (local.currentPeriodEnd || stripe.currentPeriodEnd) {
                    reasons.push('missing_authoritative_evidence');
                }

                if (!lifecycleStatusMatches(local.status, stripe.status)) reasons.push('stale_or_out_of_order_state');
            }
        }
        if (reasons.length > 0) findings.push({ subscriptionId: local.subscriptionId, reasons });
    }

    for (const stripeSubscriptionId of stripeEvidenceBySubscriptionId.keys()) {
        if (!localStripeIds.has(stripeSubscriptionId)) {
            findings.push({ subscriptionId: stripeSubscriptionId, reasons: ['missing_local_subscription'] });
        }
    }

    return findings;
}

/**
 * Executes the same read-only comparison used by operational jobs. Evidence
 * retrieval failures deliberately become missing evidence findings instead of
 * being retried by changing either billing or fulfillment state.
 */
export async function runBillingDriftAudit(
    localSubscriptions: readonly BillingDriftLocalSubscription[],
    evidenceProvider: BillingDriftEvidenceProvider,
): Promise<BillingDriftFinding[]> {
    const evidence = await Promise.all(localSubscriptions
        .filter((subscription) => Boolean(subscription.stripeSubscriptionId))
        .map(async (subscription) => {
            const stripeSubscriptionId = subscription.stripeSubscriptionId!;
            try {
                return [stripeSubscriptionId, await evidenceProvider.getBillingDriftEvidence(stripeSubscriptionId)] as const;
            } catch (error) {
                console.error(JSON.stringify({
                    event: 'billing_drift_evidence_unavailable',
                    subscriptionId: subscription.subscriptionId,
                    error: error instanceof Error ? error.name : 'unknown_error',
                }));
                return [stripeSubscriptionId, null] as const;
            }
        }));
    return buildBillingDriftAudit(localSubscriptions, new Map(
        evidence.filter((entry): entry is readonly [string, BillingDriftStripeEvidence] => entry[1] !== null),
    ));
}

/** Loads only the local fields consumed by the audit; no customer PII is read. */
export async function loadBillingDriftLocalSubscriptions(db: D1Database): Promise<BillingDriftLocalSubscription[]> {
    const { results } = await db.prepare(`
        SELECT s.id AS subscription_id, s.stripe_subscription_id, s.status, s.frequency_days,
               s.current_period_end, s.service_cycle_anchor, a.service_day
        FROM subscriptions s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN addresses a ON a.id = c.address_id
        WHERE s.stripe_subscription_id IS NOT NULL
        ORDER BY s.id
    `).all<{
        subscription_id: string;
        stripe_subscription_id: string | null;
        status: string;
        frequency_days: number;
        current_period_end: string | null;
        service_cycle_anchor: string | null;
        service_day: string | null;
    }>();
    return (results || []).map((row) => ({
        subscriptionId: row.subscription_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        status: row.status,
        frequencyDays: row.frequency_days,
        currentPeriodEnd: row.current_period_end,
        serviceCycleAnchor: row.service_cycle_anchor,
        serviceDay: row.service_day,
    }));
}
