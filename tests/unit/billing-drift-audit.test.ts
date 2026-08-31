import { describe, expect, it } from 'vitest';
import { buildBillingDriftAudit, runBillingDriftAudit } from '@/lib/reports/billingDriftAudit';

describe('buildBillingDriftAudit', () => {
    const local = {
        subscriptionId: 'sub_safe_identifier',
        stripeSubscriptionId: 'stripe_safe_identifier',
        status: 'active',
        frequencyDays: 28,
        currentPeriodEnd: '2026-09-29T04:00:00.000Z',
        serviceCycleAnchor: '2026-09-01',
        serviceDay: 'TUE',
    };

    it('emits only PII-free identifiers and detects billing drift without rewriting local fulfillment', () => {
        const report = buildBillingDriftAudit([local], new Map([['stripe_safe_identifier', {
            status: 'past_due',
            billingCycleAnchor: '2026-09-02T04:00:00.000Z',
            currentPeriodEnd: '2026-09-30T04:00:00.000Z',
            recurringPrice: { id: 'price_unknown', intervalDays: 56 },
        }]]));

        expect(report).toEqual([{
            subscriptionId: 'sub_safe_identifier',
            reasons: [
                'cadence_mismatch',
                'billing_anchor_weekday_mismatch',
                'local_service_day_mismatch',
                'period_end_mismatch',
                'stale_or_out_of_order_state',
            ],
        }]);
        expect(JSON.stringify(report)).not.toContain('example.com');
    });

    it('identifies Stripe subscriptions without a usable recurring Price as unknown', () => {
        expect(buildBillingDriftAudit([local], new Map([['stripe_safe_identifier', {
            status: 'active', billingCycleAnchor: null, currentPeriodEnd: null, recurringPrice: null,
        }]])).at(0)?.reasons).toContain('unknown_price');
    });

    it('treats a Stripe trial as an active service lifecycle state', () => {
        const report = buildBillingDriftAudit([local], new Map([['stripe_safe_identifier', {
            status: 'trialing',
            billingCycleAnchor: '2026-09-01T04:00:00.000Z',
            currentPeriodEnd: '2026-09-29T04:00:00.000Z',
            recurringPrice: { id: 'price_safe', intervalDays: 28 },
        }]]));

        expect(report.flatMap((finding) => finding.reasons)).not.toContain('stale_or_out_of_order_state');
    });

    it('fails closed for ambiguous Stripe Prices and Stripe evidence without a local Subscription', () => {
        const report = buildBillingDriftAudit([{ ...local, currentPeriodEnd: null }], new Map([
            ['stripe_safe_identifier', {
                status: 'active', billingCycleAnchor: null, currentPeriodEnd: null,
                recurringPrice: [
                    { id: 'price_safe_a', intervalDays: 28 },
                    { id: 'price_safe_b', intervalDays: 56 },
                ],
            }],
            ['stripe_without_local_subscription', {
                status: 'active', billingCycleAnchor: null, currentPeriodEnd: null,
                recurringPrice: { id: 'price_safe_c', intervalDays: 28 },
            }],
        ]));

        expect(report).toEqual([
            { subscriptionId: 'sub_safe_identifier', reasons: ['ambiguous_price'] },
            { subscriptionId: 'stripe_without_local_subscription', reasons: ['missing_local_subscription'] },
        ]);
    });

    it('turns unavailable Stripe evidence into a read-only missing-evidence finding', async () => {
        const findings = await runBillingDriftAudit([local], {
            getBillingDriftEvidence: async () => { throw new Error('Stripe unavailable'); },
        });

        expect(findings).toEqual([{ subscriptionId: 'sub_safe_identifier', reasons: ['missing_authoritative_evidence'] }]);
    });
});
