import { describe, expect, it, vi } from 'vitest';
import { StripeServiceDayReanchorGateway } from '@/lib/payment/StripeServiceDayReanchorGateway';

describe('StripeServiceDayReanchorGateway', () => {
    it('normalizes one supported weekly schedule across base and add-on items', async () => {
        const retrieve = vi.fn().mockResolvedValue({
            id: 'sub_123',
            status: 'trialing',
            metadata: { service_day: 'MON', service_cycle_anchor: '2026-08-31' },
            items: { data: [
                { current_period_end: 1_788_217_599, price: { recurring: { interval: 'week', interval_count: 4 } } },
                { current_period_end: 1_788_217_599, price: { recurring: { interval: 'week', interval_count: 4 } } },
            ] },
        });
        const gateway = new StripeServiceDayReanchorGateway('sk_test_service_day_reanchor');
        Object.assign(gateway as unknown as { stripe: { subscriptions: { retrieve: typeof retrieve } } }, {
            stripe: { subscriptions: { retrieve } },
        });

        await expect(gateway.getSubscription('sub_123')).resolves.toMatchObject({
            subscriptionId: 'sub_123', status: 'trialing', frequencyDays: 28,
        });
    });

    it('updates only the audited service-schedule metadata with an idempotency key', async () => {
        const update = vi.fn().mockResolvedValue({});
        const gateway = new StripeServiceDayReanchorGateway('sk_test_service_day_reanchor');
        Object.assign(gateway as unknown as { stripe: { subscriptions: { update: typeof update } } }, {
            stripe: { subscriptions: { update } },
        });

        await gateway.updateServiceCycleMetadata({
            subscriptionId: 'sub_123',
            serviceDay: 'TUE',
            serviceCycleAnchor: '2026-10-06',
            correlationKey: 'repair-123',
            metadata: { source: 'legacy', service_day: 'MON' },
        });

        expect(update).toHaveBeenCalledWith('sub_123', {
            metadata: {
                source: 'legacy',
                service_day: 'TUE',
                service_cycle_anchor: '2026-10-06',
                service_day_reanchor_correlation_key: 'repair-123',
            },
        }, { idempotencyKey: 'repair-123' });
        const [, updateInput] = update.mock.calls[0];
        expect(updateInput).not.toHaveProperty('billing_cycle_anchor');
        expect(updateInput).not.toHaveProperty('items');
    });

    it('restores an absent metadata correlation key while retaining API idempotency', async () => {
        const update = vi.fn().mockResolvedValue({});
        const gateway = new StripeServiceDayReanchorGateway('sk_test_service_day_reanchor');
        Object.assign(gateway as unknown as { stripe: { subscriptions: { update: typeof update } } }, {
            stripe: { subscriptions: { update } },
        });

        await gateway.updateServiceCycleMetadata({
            subscriptionId: 'sub_123',
            serviceDay: 'MON',
            serviceCycleAnchor: '2026-09-08',
            correlationKey: 'repair-123:inverse',
            metadataCorrelationKey: null,
            metadata: { service_day: 'TUE', service_cycle_anchor: '2026-10-06', service_day_reanchor_correlation_key: 'repair-123' },
        });

        expect(update).toHaveBeenCalledWith('sub_123', {
            metadata: expect.objectContaining({ service_day_reanchor_correlation_key: '' }),
        }, { idempotencyKey: 'repair-123:inverse' });
    });
});
