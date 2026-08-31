import { describe, expect, it } from 'vitest';
import { SERVICE_CYCLE_INVARIANT_AUDIT_SQL, summarizeServiceCycleInvariantAudit } from '@/lib/reports/serviceCycleInvariantAudit';

describe('Service Cycle invariant audit', () => {
    it('is PII-free and separates repair-blocking findings from explicit review work', () => {
        expect(SERVICE_CYCLE_INVARIANT_AUDIT_SQL).toMatch(/^\s*WITH /);
        expect(SERVICE_CYCLE_INVARIANT_AUDIT_SQL).not.toMatch(/email|phone|name|raw_address|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE/i);
        expect(summarizeServiceCycleInvariantAudit([
            { finding: 'noncanonical_service_date', subscriptionId: 'sub_1', cycleDueDate: null, count: 1 },
            { finding: 'recurring_anchor_review_required', subscriptionId: 'sub_2', cycleDueDate: null, count: 1 },
        ])).toEqual({ blockingFindingCount: 1, reviewRequiredCount: 1, isClean: false });
    });
});
