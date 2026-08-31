import { describe, expect, it } from 'vitest';
import { buildServiceCycleDispatchCutoverReport, hasServiceCycleDispatchParity, isServiceCycleDispatchCutoverApproved } from '@/lib/dispatch/serviceCycleDispatchCutover';

describe('Service Cycle dispatch cutover', () => {
    it('fails closed unless every recorded cutover approval is explicitly true', () => {
        expect(isServiceCycleDispatchCutoverApproved(null)).toBe(false);
        expect(isServiceCycleDispatchCutoverApproved('{broken')).toBe(false);
        expect(isServiceCycleDispatchCutoverApproved(JSON.stringify({ enabled: true, parityVerified: true }))).toBe(false);
        expect(isServiceCycleDispatchCutoverApproved(JSON.stringify({
            enabled: true, parityVerified: true, recoveryAuditVerified: true, billingDriftAuditVerified: true,
        }))).toBe(true);
    });

    it('reports only subscription identifiers and blocks a parity mismatch', () => {
        const report = buildServiceCycleDispatchCutoverReport(['legacy_b', 'shared'], ['cycle_a', 'shared'], ['review_c', 'review_c']);

        expect(report).toEqual({
            legacyOnlySubscriptionIds: ['legacy_b'],
            cycleOnlySubscriptionIds: ['cycle_a'],
            reviewSubscriptionIds: ['review_c'],
            recoveryReviewSuppressions: [],
        });
        expect(hasServiceCycleDispatchParity(report)).toBe(false);
        expect(JSON.stringify(report)).not.toContain('address');
    });
});
