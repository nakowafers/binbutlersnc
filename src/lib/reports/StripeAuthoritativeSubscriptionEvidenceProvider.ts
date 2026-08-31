import Stripe from 'stripe';
import type { StripeSubscriptionEvidence, StripeSubscriptionEvidenceProvider } from './serviceCycleRecovery';
import { stripeRecurringCadenceDays } from '@/lib/payment/stripeRecurringCadence';

interface StripeSubscriptionSnapshot {
    status: string;
    billing_cycle_anchor?: number | null;
    current_period_end?: number | null;
    items: {
        data: Array<{
            current_period_end?: number | null;
            price: {
                id: string;
                recurring?: { interval?: string | null; interval_count?: number | null } | null;
            };
        }>;
    };
}

export interface StripeSubscriptionEvidenceClient {
    subscriptions: { retrieve(subscriptionId: string): Promise<StripeSubscriptionSnapshot> };
}

export type StripePriceCadenceAllowlist = ReadonlyMap<string, 28 | 56 | 84>;

function configuredIds(value: string | undefined): string[] {
    return value?.split(',').map((id) => id.trim()).filter(Boolean) || [];
}

/** Maps explicit configured Price IDs, including grandfathered IDs, to the service cadence. */
export function stripePriceCadenceAllowlistFromEnvironment(environment: object): StripePriceCadenceAllowlist {
    const values = environment as Record<string, string | undefined>;
    const allowlist = new Map<string, 28 | 56 | 84>();
    const add = (cadence: 28 | 56 | 84, ...values: Array<string | undefined>) => {
        for (const id of values.flatMap(configuredIds)) {
            const previous = allowlist.get(id);
            if (previous && previous !== cadence) throw new Error('A configured Stripe Price ID cannot map to more than one cadence.');
            allowlist.set(id, cadence);
        }
    };
    add(28, values.STRIPE_MONTHLY_PRICE_ID, values.STRIPE_EXTRA_BIN_MONTHLY_PRICE_ID, values.STRIPE_GRANDFATHERED_MONTHLY_PRICE_IDS);
    add(56, values.STRIPE_BIMONTHLY_PRICE_ID, values.STRIPE_EXTRA_BIN_BIMONTHLY_PRICE_ID, values.STRIPE_GRANDFATHERED_BIMONTHLY_PRICE_IDS);
    add(84, values.STRIPE_QUARTERLY_PRICE_ID, values.STRIPE_EXTRA_BIN_QUARTERLY_PRICE_ID, values.STRIPE_GRANDFATHERED_QUARTERLY_PRICE_IDS);
    return allowlist;
}

function isoTimestamp(unixSeconds: number | null | undefined): string | null {
    if (!Number.isInteger(unixSeconds) || !unixSeconds || unixSeconds < 0) return null;
    return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Read-only adapter for the minimal Stripe facts used by recovery classification.
 * It intentionally drops customer, payment, metadata, invoice, and Price display data.
 */
export class StripeAuthoritativeSubscriptionEvidenceProvider implements StripeSubscriptionEvidenceProvider {
    constructor(private readonly client: StripeSubscriptionEvidenceClient, private readonly priceCadenceAllowlist: StripePriceCadenceAllowlist) {}

    static fromSecretKey(secretKey: string, priceCadenceAllowlist: StripePriceCadenceAllowlist): StripeAuthoritativeSubscriptionEvidenceProvider {
        return new StripeAuthoritativeSubscriptionEvidenceProvider(new Stripe(secretKey), priceCadenceAllowlist);
    }

    async getEvidence(stripeSubscriptionId: string): Promise<StripeSubscriptionEvidence> {
        const subscription = await this.client.subscriptions.retrieve(stripeSubscriptionId);
        const recurringItems = subscription.items.data.filter((item) => Boolean(item.price.recurring)).map((item) => ({
            item,
            cadenceDays: stripeRecurringCadenceDays(item.price.recurring),
            allowlistedCadence: this.priceCadenceAllowlist.get(item.price.id),
        }));
        const cadenceDays = new Set(recurringItems.map(({ cadenceDays }) => cadenceDays));
        const periodEnds = new Set(recurringItems.map(({ item }) => item.current_period_end).filter((value): value is number => Number.isInteger(value)));
        const allowedCadence = recurringItems[0]?.allowlistedCadence;
        const recurringSchedule = recurringItems.length > 0
            && !cadenceDays.has(null)
            && cadenceDays.size === 1
            && allowedCadence !== undefined
            && recurringItems.every(({ cadenceDays, allowlistedCadence }) => cadenceDays === allowedCadence && allowlistedCadence === allowedCadence)
            && periodEnds.size <= 1
            ? {
                id: recurringItems.map(({ item }) => item.price.id).sort().join(','),
                intervalDays: allowedCadence,
            }
            : null;

        return {
            status: subscription.status,
            billingCycleAnchor: isoTimestamp(subscription.billing_cycle_anchor),
            currentPeriodEnd: isoTimestamp(subscription.current_period_end ?? recurringItems[0]?.item.current_period_end),
            recurringPrice: recurringSchedule,
        };
    }
}
