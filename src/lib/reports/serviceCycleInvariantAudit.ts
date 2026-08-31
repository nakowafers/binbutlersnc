export type ServiceCycleInvariantFinding =
    | 'noncanonical_service_date'
    | 'noncanonical_cycle_due_date'
    | 'noncanonical_anchor'
    | 'duplicate_cycle_obligation'
    | 'multiple_successful_completions'
    | 'recurring_anchor_review_required';

export interface ServiceCycleInvariantAuditRow {
    finding: ServiceCycleInvariantFinding;
    subscriptionId: string;
    cycleDueDate: string | null;
    count: number;
}

export interface ServiceCycleInvariantAuditSummary {
    blockingFindingCount: number;
    reviewRequiredCount: number;
    isClean: boolean;
}

/** Read-only and PII-free: emits identifiers and aggregate counts only. */
export const SERVICE_CYCLE_INVARIANT_AUDIT_SQL = `
WITH findings AS (
    SELECT 'noncanonical_service_date' AS finding, subscription_id, NULL AS cycle_due_date, COUNT(*) AS count
    FROM service_history
    WHERE service_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
       OR date(service_date, '+0 days') IS NOT service_date
    GROUP BY subscription_id
    UNION ALL
    SELECT 'noncanonical_service_date', subscription_id, NULL, COUNT(*)
    FROM dispatch_stops
    WHERE service_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
       OR date(service_date, '+0 days') IS NOT service_date
    GROUP BY subscription_id
    UNION ALL
    SELECT 'noncanonical_cycle_due_date', subscription_id, cycle_due_date, COUNT(*)
    FROM service_cycles
    WHERE cycle_due_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
       OR date(cycle_due_date, '+0 days') IS NOT cycle_due_date
    GROUP BY subscription_id, cycle_due_date
    UNION ALL
    SELECT 'noncanonical_anchor', id, service_cycle_anchor, 1
    FROM subscriptions
    WHERE service_cycle_anchor IS NOT NULL
      AND (service_cycle_anchor NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
           OR date(service_cycle_anchor, '+0 days') IS NOT service_cycle_anchor)
    UNION ALL
    SELECT 'duplicate_cycle_obligation', subscription_id, cycle_due_date, COUNT(*)
    FROM service_cycles GROUP BY subscription_id, cycle_due_date HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'multiple_successful_completions', sc.subscription_id, sc.cycle_due_date, COUNT(*)
    FROM service_history sh JOIN service_cycles sc ON sc.id = sh.service_cycle_id
    WHERE sh.dispatch_status = 'Completed'
    GROUP BY sh.service_cycle_id HAVING COUNT(*) > 1
    UNION ALL
    SELECT 'recurring_anchor_review_required', id, NULL, 1
    FROM subscriptions
    WHERE status IN ('active', 'canceled', 'cancelled') AND frequency_days IN (28, 56, 84)
      AND next_service_date IS NULL
      AND (service_cycle_anchor IS NULL OR service_cycle_anchor NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
           OR date(service_cycle_anchor, '+0 days') IS NOT service_cycle_anchor)
      AND NOT EXISTS (
          SELECT 1 FROM subscription_recovery_reviews review
          WHERE review.subscription_id = subscriptions.id
            AND review.classification = 'needs_review'
      )
)
SELECT finding, subscription_id, cycle_due_date, count
FROM findings
ORDER BY finding, subscription_id, cycle_due_date`;

export function summarizeServiceCycleInvariantAudit(rows: readonly ServiceCycleInvariantAuditRow[]): ServiceCycleInvariantAuditSummary {
    const reviewRequiredCount = rows.filter((row) => row.finding === 'recurring_anchor_review_required').length;
    const blockingFindingCount = rows.length - reviewRequiredCount;
    return { blockingFindingCount, reviewRequiredCount, isClean: blockingFindingCount === 0 && reviewRequiredCount === 0 };
}
