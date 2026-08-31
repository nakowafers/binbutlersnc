import { describe, expect, it } from 'vitest';
import { buildServiceCycleRecoveryInventory, SERVICE_CYCLE_RECOVERY_INVENTORY_SQL } from '@/lib/reports/serviceCycleRecoveryInventory';

describe('Service Cycle recovery inventory', () => {
    it('reports PII-free date-shape, missing-anchor, and classification evidence', async () => {
        const rows = await buildServiceCycleRecoveryInventory([
            {
                subscription: { id: 'sub_safe_id', status: 'active', serviceDay: 'TUE', frequencyDays: 28, currentPeriodEnd: '2026-09-29T04:00:00.000Z', serviceCycleAnchor: null, stripeSubscriptionId: 'stripe_sub_ignored' },
                history: [{ id: 'history_1', serviceDate: '2026-09-01T16:00:00.000Z', dispatchStatus: 'Completed', completedAt: '2026-09-01T18:00:00.000Z' }],
                stops: [],
            },
        ], { getEvidence: async () => ({ status: 'active', billingCycleAnchor: '2026-09-01T04:00:00.000Z', currentPeriodEnd: '2026-09-29T04:00:00.000Z', recurringPrice: { id: 'price_ignored', intervalDays: 28 } }) });

        expect(rows).toEqual([expect.objectContaining({ subscriptionId: 'sub_safe_id', canonicalServiceDateCount: 0, timestampShapedServiceDateCount: 1, missingAnchor: true, classification: expect.objectContaining({ status: 'needs_review' }) })]);
        expect(JSON.stringify(rows)).not.toMatch(/stripe_sub_ignored|price_ignored|@|address|phone/i);
    });

    it('uses a read-only query that does not select customer PII', () => {
        expect(SERVICE_CYCLE_RECOVERY_INVENTORY_SQL).toMatch(/^\s*SELECT /);
        expect(SERVICE_CYCLE_RECOVERY_INVENTORY_SQL).toContain("s.status IN ('active', 'canceled', 'cancelled')");
        expect(SERVICE_CYCLE_RECOVERY_INVENTORY_SQL).not.toMatch(/c\.(email|phone|name)|raw_address|first_name|last_name/i);
        expect(SERVICE_CYCLE_RECOVERY_INVENTORY_SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
    });
});
