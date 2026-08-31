import { describe, expect, it, vi } from 'vitest';
import {
    StripeAuthoritativeSubscriptionEvidenceProvider,
    stripePriceCadenceAllowlistFromEnvironment,
    type StripeSubscriptionEvidenceClient,
} from '@/lib/reports/StripeAuthoritativeSubscriptionEvidenceProvider';

const allowlist = stripePriceCadenceAllowlistFromEnvironment({
    STRIPE_MONTHLY_PRICE_ID: 'price_safe',
    STRIPE_EXTRA_BIN_MONTHLY_PRICE_ID: 'price_base',
    STRIPE_GRANDFATHERED_MONTHLY_PRICE_IDS: 'price_add_on',
    STRIPE_BIMONTHLY_PRICE_ID: 'price_one',
    STRIPE_GRANDFATHERED_BIMONTHLY_PRICE_IDS: 'price_two',
});

describe('StripeAuthoritativeSubscriptionEvidenceProvider', () => {
    it('returns only sanitized cadence, anchor, period end, and status from Stripe', async () => {
        const retrieve = vi.fn().mockResolvedValue({
            status: 'active', billing_cycle_anchor: 1_788_249_600,
            items: { data: [{
                current_period_end: 1_790_668_800,
                price: { id: 'price_safe', recurring: { interval: 'day', interval_count: 28 } },
            }] },
            customer: 'cus_must_not_escape', metadata: { address: 'must_not_escape' },
        });
        const provider = new StripeAuthoritativeSubscriptionEvidenceProvider({ subscriptions: { retrieve } } as StripeSubscriptionEvidenceClient, allowlist);

        await expect(provider.getEvidence('sub_safe')).resolves.toEqual({
            status: 'active', billingCycleAnchor: '2026-09-01T08:00:00.000Z',
            currentPeriodEnd: '2026-09-29T08:00:00.000Z', recurringPrice: { id: 'price_safe', intervalDays: 28 },
        });
        expect(retrieve).toHaveBeenCalledWith('sub_safe');
    });

    it('fails closed when Stripe returns conflicting recurring cadences', async () => {
        const provider = new StripeAuthoritativeSubscriptionEvidenceProvider({ subscriptions: { retrieve: vi.fn().mockResolvedValue({
            status: 'active', billing_cycle_anchor: 1_788_249_600,
            items: { data: [
                { current_period_end: 1_790_668_800, price: { id: 'price_one', recurring: { interval: 'day', interval_count: 28 } } },
                { current_period_end: 1_790_668_800, price: { id: 'price_two', recurring: { interval: 'day', interval_count: 56 } } },
            ] },
        }) } } as StripeSubscriptionEvidenceClient, allowlist);

        await expect(provider.getEvidence('sub_safe')).resolves.toMatchObject({ recurringPrice: null, status: 'active' });
    });

    it('normalizes same-cadence weekly base and add-on items into one schedule', async () => {
        const provider = new StripeAuthoritativeSubscriptionEvidenceProvider({ subscriptions: { retrieve: vi.fn().mockResolvedValue({
            status: 'trialing', billing_cycle_anchor: 1_788_249_600,
            items: { data: [
                { current_period_end: 1_790_668_800, price: { id: 'price_base', recurring: { interval: 'week', interval_count: 4 } } },
                { current_period_end: 1_790_668_800, price: { id: 'price_add_on', recurring: { interval: 'week', interval_count: 4 } } },
            ] },
        }) } } as StripeSubscriptionEvidenceClient, allowlist);

        await expect(provider.getEvidence('sub_safe')).resolves.toMatchObject({
            status: 'trialing', recurringPrice: { id: 'price_add_on,price_base', intervalDays: 28 },
        });
    });

    it('rejects an unknown Price even when its Stripe interval matches a supported cadence', async () => {
        const provider = new StripeAuthoritativeSubscriptionEvidenceProvider({ subscriptions: { retrieve: vi.fn().mockResolvedValue({
            status: 'active', billing_cycle_anchor: 1_788_249_600,
            items: { data: [{ current_period_end: 1_790_668_800, price: { id: 'price_not_allowlisted', recurring: { interval: 'week', interval_count: 4 } } }] },
        }) } } as StripeSubscriptionEvidenceClient, allowlist);

        await expect(provider.getEvidence('sub_safe')).resolves.toMatchObject({ recurringPrice: null });
    });

    it('parses comma-separated grandfathered Price IDs into the same explicit cadence allowlist', () => {
        const grandfathered = stripePriceCadenceAllowlistFromEnvironment({
            STRIPE_MONTHLY_PRICE_ID: 'price_current_monthly',
            STRIPE_GRANDFATHERED_MONTHLY_PRICE_IDS: 'price_old_monthly_a, price_old_monthly_b',
            STRIPE_BIMONTHLY_PRICE_ID: 'price_current_bimonthly',
            STRIPE_GRANDFATHERED_BIMONTHLY_PRICE_IDS: 'price_old_bimonthly',
            STRIPE_QUARTERLY_PRICE_ID: 'price_current_quarterly',
            STRIPE_GRANDFATHERED_QUARTERLY_PRICE_IDS: 'price_old_quarterly',
        });

        expect([...grandfathered.entries()]).toEqual(expect.arrayContaining([
            ['price_current_monthly', 28], ['price_old_monthly_a', 28], ['price_old_monthly_b', 28],
            ['price_current_bimonthly', 56], ['price_old_bimonthly', 56],
            ['price_current_quarterly', 84], ['price_old_quarterly', 84],
        ]));
    });
});
