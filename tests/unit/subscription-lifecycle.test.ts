import { describe, expect, it, vi } from 'vitest';
import { SubscriptionLifecycle } from '@/lib/payment/SubscriptionLifecycle';

function lifecycle(overrides: { subscriptionRepo?: Record<string, unknown>; paymentService?: Record<string, unknown> } = {}) {
    const leadRepo = {
        claimWebhookEvent: vi.fn().mockResolvedValue(true),
        releaseWebhookEventClaim: vi.fn(),
    };
    const subscriptionRepo = {
        updateSubscriptionStatus: vi.fn(),
        getSubscriptionIdByStripeId: vi.fn().mockResolvedValue('local-subscription'),
        getPaymentFailureCycleSubscription: vi.fn().mockResolvedValue({
            id: 'local-subscription', frequencyDays: 28, serviceCycleAnchor: '2026-08-29', serviceDay: 'SAT',
        }),
        recordCycleException: vi.fn(),
        ...overrides.subscriptionRepo,
    };
    const serviceHistoryRepo = {};
    const paymentService = { retrieveSubscriptionPeriodEnd: vi.fn(), ...overrides.paymentService };
    return {
        leadRepo,
        subscriptionRepo,
        serviceHistoryRepo,
        paymentService,
        subject: new SubscriptionLifecycle(leadRepo as any, {} as any, subscriptionRepo as any, serviceHistoryRepo as any, paymentService as any),
    };
}

describe('SubscriptionLifecycle billing events', () => {
    it('records an idempotent billing exception for the invoice cycle without modifying service attempts', async () => {
        const { subject, subscriptionRepo, serviceHistoryRepo } = lifecycle();
        const event = {
            id: 'evt_payment_failed', type: 'invoice.payment_failed',
            data: { object: { subscription: 'stripe-subscription', customer: 'cus_123', period_start: Date.parse('2026-08-29T12:00:00Z') / 1000 } },
        };

        await subject.processEvent(event as any);

        expect(subscriptionRepo.updateSubscriptionStatus).toHaveBeenCalledWith('stripe-subscription', 'past_due', null);
        expect(subscriptionRepo.recordCycleException).toHaveBeenCalledWith(expect.objectContaining({
            subscriptionId: 'local-subscription', cycleDueDate: '2026-08-29', reason: 'billing_delinquency',
            correlationKey: 'billing-delinquency:evt_payment_failed',
        }));
        expect(serviceHistoryRepo).toEqual({});
    });

    it('does not apply an older payment failure twice when Stripe retries the same event', async () => {
        const { subject, leadRepo, subscriptionRepo } = lifecycle();
        leadRepo.claimWebhookEvent.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        const event = {
            id: 'evt_payment_retry', type: 'invoice.payment_failed',
            data: { object: { subscription: 'stripe-subscription', customer: 'cus_123', created: Date.parse('2026-08-29T12:00:00Z') / 1000 } },
        };

        await subject.processEvent(event as any);
        await subject.processEvent(event as any);

        expect(subscriptionRepo.recordCycleException).toHaveBeenCalledTimes(1);
        expect(subscriptionRepo.updateSubscriptionStatus).toHaveBeenCalledTimes(1);
    });

    it('does not invent a billing exception when Stripe evidence normalizes to a non-service day', async () => {
        const { subject, subscriptionRepo } = lifecycle({
            subscriptionRepo: { getPaymentFailureCycleSubscription: vi.fn().mockResolvedValue({
                id: 'local-subscription', frequencyDays: 28, serviceCycleAnchor: '2026-08-29', serviceDay: 'SAT',
            }) },
        });

        await subject.processEvent({
            id: 'evt_payment_non_service_day', type: 'invoice.payment_failed',
            data: { object: { subscription: 'stripe-subscription', customer: 'cus_123', period_start: Date.parse('2026-08-30T12:00:00Z') / 1000 } },
        } as any);

        expect(subscriptionRepo.recordCycleException).not.toHaveBeenCalled();
    });

    it('allows a later payment success to restore billing status without touching service attempts or anchors', async () => {
        const { subject, subscriptionRepo, serviceHistoryRepo } = lifecycle({
            paymentService: { retrieveSubscriptionPeriodEnd: vi.fn().mockResolvedValue(Date.parse('2026-09-26T00:00:00Z') / 1000) },
        });

        await subject.processEvent({
            id: 'evt_payment_succeeded', type: 'invoice.payment_succeeded',
            data: { object: { subscription: 'stripe-subscription' } },
        } as any);

        expect(subscriptionRepo.updateSubscriptionStatus).toHaveBeenCalledWith('stripe-subscription', 'active', '2026-09-26T00:00:00.000Z');
        expect(subscriptionRepo.recordCycleException).not.toHaveBeenCalled();
        expect(serviceHistoryRepo).toEqual({});
    });
});
