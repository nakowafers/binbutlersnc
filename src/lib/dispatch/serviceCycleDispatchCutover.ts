export const SERVICE_CYCLE_DISPATCH_CUTOVER_SETTING = 'service_cycle_dispatch_cutover';

export interface ServiceCycleDispatchCutoverConfig {
    enabled: boolean;
    parityVerified: boolean;
    recoveryAuditVerified: boolean;
    billingDriftAuditVerified: boolean;
}

export interface ServiceCycleDispatchCutoverReport {
    legacyOnlySubscriptionIds: string[];
    cycleOnlySubscriptionIds: string[];
    reviewSubscriptionIds: string[];
    recoveryReviewSuppressions: Array<{ subscriptionId: string; reason: string }>;
}

/** An absent, malformed, or incomplete approval never enables the new eligibility path. */
export function isServiceCycleDispatchCutoverApproved(value: string | null): boolean {
    if (!value) return false;
    try {
        const config = JSON.parse(value) as Partial<ServiceCycleDispatchCutoverConfig>;
        return config.enabled === true
            && config.parityVerified === true
            && config.recoveryAuditVerified === true
            && config.billingDriftAuditVerified === true;
    } catch {
        return false;
    }
}

/** Contains subscription identifiers only; callers must not add customer or address fields. */
export function buildServiceCycleDispatchCutoverReport(
    legacySubscriptionIds: readonly string[],
    cycleSubscriptionIds: readonly string[],
    reviewSubscriptionIds: readonly string[],
    recoveryReviewSuppressions: ReadonlyArray<{ subscriptionId: string; reason: string }> = [],
): ServiceCycleDispatchCutoverReport {
    const legacy = new Set(legacySubscriptionIds);
    const cycle = new Set(cycleSubscriptionIds);
    return {
        legacyOnlySubscriptionIds: [...legacy].filter((id) => !cycle.has(id)).sort(),
        cycleOnlySubscriptionIds: [...cycle].filter((id) => !legacy.has(id)).sort(),
        reviewSubscriptionIds: [...new Set(reviewSubscriptionIds)].sort(),
        recoveryReviewSuppressions: [...recoveryReviewSuppressions]
            .sort((a, b) => a.subscriptionId.localeCompare(b.subscriptionId) || a.reason.localeCompare(b.reason)),
    };
}

export function hasServiceCycleDispatchParity(report: ServiceCycleDispatchCutoverReport): boolean {
    return report.legacyOnlySubscriptionIds.length === 0 && report.cycleOnlySubscriptionIds.length === 0;
}
