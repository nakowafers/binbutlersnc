import {
    classifyServiceCycleRecovery,
    type RecoveryHistory,
    type RecoveryStop,
    type RecoverySubscription,
    type StripeSubscriptionEvidenceProvider,
} from './serviceCycleRecovery';

export interface RecoveryInventoryCandidate {
    subscription: RecoverySubscription & { stripeSubscriptionId: string | null };
    history: RecoveryHistory[];
    stops: RecoveryStop[];
}

export interface ServiceCycleRecoveryInventoryRow {
    subscriptionId: string;
    frequencyDays: number;
    serviceDay: string | null;
    canonicalServiceDateCount: number;
    timestampShapedServiceDateCount: number;
    malformedServiceDateCount: number;
    missingAnchor: boolean;
    duplicateCompletionRisk: boolean;
    routeHistoryDisagreement: boolean;
    completionChronologyCount: number;
    classification: ReturnType<typeof classifyServiceCycleRecovery>;
}

/** PII-free, read-only inventory. It deliberately selects no customer contact or address fields. */
export const SERVICE_CYCLE_RECOVERY_INVENTORY_SQL = `
SELECT s.id AS subscription_id, s.stripe_subscription_id, s.status, s.frequency_days, s.current_period_end,
       s.service_cycle_anchor, a.service_day,
       sh.id AS history_id, sh.service_date AS history_service_date, sh.dispatch_status AS history_dispatch_status,
       sh.completed_at AS history_completed_at, sh.cycle_due_date AS history_cycle_due_date, sh.service_cycle_id AS history_cycle_id,
       ds.id AS stop_id, ds.service_history_id AS stop_history_id, ds.service_date AS stop_service_date,
       ds.dispatch_status AS stop_dispatch_status, ds.cycle_due_date AS stop_cycle_due_date, ds.service_cycle_id AS stop_cycle_id
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
LEFT JOIN addresses a ON a.id = c.address_id
LEFT JOIN service_history sh ON sh.subscription_id = s.id
LEFT JOIN dispatch_stops ds ON ds.subscription_id = s.id
WHERE s.status IN ('active', 'canceled', 'cancelled') AND s.frequency_days IN (28, 56, 84)
ORDER BY s.id, sh.id, ds.id`;

function isCanonical(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value); }
function isTimestamp(value: string): boolean { return /^\d{4}-\d{2}-\d{2}T/.test(value); }

export async function buildServiceCycleRecoveryInventory(
    candidates: readonly RecoveryInventoryCandidate[],
    evidenceProvider: StripeSubscriptionEvidenceProvider,
): Promise<ServiceCycleRecoveryInventoryRow[]> {
    return Promise.all(candidates.map(async ({ subscription, history, stops }) => {
        const evidence = subscription.stripeSubscriptionId ? await evidenceProvider.getEvidence(subscription.stripeSubscriptionId) : null;
        const classification = classifyServiceCycleRecovery({ subscription, stripe: evidence, history, stops });
        const completed = history.filter((item) => item.dispatchStatus === 'Completed');
        const completedDates = completed.map((item) => item.serviceDate);
        const linked = new Map(history.map((item) => [item.id, item]));
        return {
            subscriptionId: subscription.id,
            frequencyDays: subscription.frequencyDays,
            serviceDay: subscription.serviceDay,
            canonicalServiceDateCount: history.filter((item) => isCanonical(item.serviceDate)).length,
            timestampShapedServiceDateCount: history.filter((item) => isTimestamp(item.serviceDate)).length,
            malformedServiceDateCount: history.filter((item) => !isCanonical(item.serviceDate) && !isTimestamp(item.serviceDate)).length,
            missingAnchor: !subscription.serviceCycleAnchor,
            duplicateCompletionRisk: new Set(completedDates).size !== completedDates.length,
            routeHistoryDisagreement: stops.some((stop) => linked.get(stop.serviceHistoryId)?.serviceDate !== stop.serviceDate),
            completionChronologyCount: completed.length,
            classification,
        };
    }));
}
