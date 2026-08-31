import Stripe from 'stripe';
import { ServiceDayReanchorStripeGateway, StripeSubscriptionBoundary } from '@/lib/service-cycle/ServiceDayReanchor';
import { stripeRecurringCadenceDays } from './stripeRecurringCadence';

/** Stripe is changed only through subscription metadata at an existing period boundary. */
export class StripeServiceDayReanchorGateway implements ServiceDayReanchorStripeGateway {
    private readonly stripe: Stripe;

    constructor(secretKey: string) {
        this.stripe = new Stripe(secretKey);
    }

    async getSubscription(subscriptionId: string): Promise<StripeSubscriptionBoundary> {
        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
        const schedules = subscription.items.data.map((item) => ({
            periodEnd: item.current_period_end,
            cadenceDays: stripeRecurringCadenceDays(item.price.recurring),
        }));
        const periodEnds = new Set(schedules.map(({ periodEnd }) => periodEnd));
        const cadences = new Set(schedules.map(({ cadenceDays }) => cadenceDays));
        if (schedules.length === 0 || cadences.has(null) || cadences.size !== 1 || periodEnds.size !== 1) {
            throw new Error(`Stripe subscription ${subscriptionId} lacks one unambiguous supported recurring schedule`);
        }
        const periodEnd = schedules[0].periodEnd;
        const cadence = schedules[0].cadenceDays!;
        return {
            subscriptionId: subscription.id,
            status: subscription.status,
            frequencyDays: cadence,
            currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
            metadata: { ...subscription.metadata },
        };
    }

    async updateServiceCycleMetadata(input: Parameters<ServiceDayReanchorStripeGateway['updateServiceCycleMetadata']>[0]): Promise<void> {
        await this.stripe.subscriptions.update(input.subscriptionId, {
            metadata: {
                ...input.metadata,
                service_day: input.serviceDay,
                service_cycle_anchor: input.serviceCycleAnchor,
                service_day_reanchor_correlation_key: input.metadataCorrelationKey === null
                    ? ''
                    : input.metadataCorrelationKey ?? input.correlationKey,
            },
        }, { idempotencyKey: input.correlationKey });
    }
}
