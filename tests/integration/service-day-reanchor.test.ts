import { beforeEach, describe, expect, it, vi } from 'vitest';
import { D1ServiceDayReanchorRepository } from '@/lib/service-cycle/D1ServiceDayReanchorRepository';
import { ServiceDayReanchor, ServiceDayReanchorRepository, StripeSubscriptionBoundary } from '@/lib/service-cycle/ServiceDayReanchor';
import { DbSimulator } from './db-simulator';

const currentPeriodEnd = '2026-10-06T04:00:00.000Z';
const proposal = { serviceDay: 'TUE', serviceCycleAnchor: '2026-10-06', stripePeriodBoundary: currentPeriodEnd };

class FakeStripe {
    inverseFailure: Error | null = null;
    state: StripeSubscriptionBoundary = {
        subscriptionId: 'stripe_sub_1', status: 'active', frequencyDays: 28, currentPeriodEnd,
        metadata: { service_day: 'MON', service_cycle_anchor: '2026-09-08' },
    };
    update = vi.fn(async (input: { serviceDay: string; serviceCycleAnchor: string; correlationKey: string; metadataCorrelationKey?: string | null; metadata: Record<string, string> }) => {
        if (input.correlationKey.endsWith(':inverse') && this.inverseFailure) throw this.inverseFailure;
        const metadata = { ...input.metadata, service_day: input.serviceDay, service_cycle_anchor: input.serviceCycleAnchor };
        const metadataCorrelationKey = input.metadataCorrelationKey === undefined ? input.correlationKey : input.metadataCorrelationKey;
        if (metadataCorrelationKey === null) delete metadata.service_day_reanchor_correlation_key;
        else metadata.service_day_reanchor_correlation_key = metadataCorrelationKey;
        this.state = { ...this.state, metadata };
    });
    async getSubscription(): Promise<StripeSubscriptionBoundary> { return { ...this.state, metadata: { ...this.state.metadata } }; }
    async updateServiceCycleMetadata(input: Parameters<FakeStripe['update']>[0]) { return this.update(input); }
}

describe('Service Day re-anchor operation', () => {
    let simulator: DbSimulator;
    let repository: D1ServiceDayReanchorRepository;
    let stripe: FakeStripe;

    beforeEach(() => {
        simulator = new DbSimulator();
        simulator.db.exec(`
            INSERT INTO customers (id, email) VALUES ('customer_1', 'customer@example.com');
            INSERT INTO addresses (id, customer_id, raw_address, trash_day, service_day) VALUES ('addr_1', 'customer_1', '1 Main St', 'MON', 'MON');
            UPDATE customers SET address_id = 'addr_1' WHERE id = 'customer_1';
            INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days, current_period_end, service_cycle_anchor)
                VALUES ('sub_1', 'customer_1', 'stripe_sub_1', 'active', 28, '${currentPeriodEnd}', '2026-09-08');
            INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES ('future_cycle', 'sub_1', '2026-10-06', 'open');
            INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, correlation_key)
                VALUES ('future_cycle_created', 'future_cycle', 'created', NULL, 'open', 'system', 'system', '2026-09-01T12:00:00.000Z', 'future-cycle-created');
            INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES ('historical_cycle', 'sub_1', '2026-09-08', 'fulfilled');
            INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, correlation_key)
                VALUES ('historical_cycle_created', 'historical_cycle', 'created', NULL, 'open', 'system', 'system', '2026-08-01T12:00:00.000Z', 'historical-cycle-created');
        `);
        repository = new D1ServiceDayReanchorRepository(simulator as unknown as D1Database);
        stripe = new FakeStripe();
    });

    const input = (overrides: Partial<Parameters<ServiceDayReanchor['execute']>[0]> = {}) => ({
        subscriptionId: 'sub_1', expected: { serviceDay: 'MON', serviceCycleAnchor: '2026-09-08', currentPeriodEnd }, proposal,
        actor: { id: 'operator_1', capacity: 'administration' as const }, reason: 'Customer trash collection changed',
        occurredAt: '2026-09-15T12:00:00.000Z', correlationKey: 'reanchor-1', ...overrides,
    });

    it('coordinates Stripe and D1, appends evidence, and preserves historical fulfillment', async () => {
        const operation = new ServiceDayReanchor(repository, stripe);
        await expect(operation.execute(input())).resolves.toBe('applied');

        expect(simulator.db.prepare("SELECT service_day FROM addresses WHERE id = 'addr_1'").get()).toEqual({ service_day: 'TUE' });
        expect(simulator.db.prepare("SELECT service_cycle_anchor FROM subscriptions WHERE id = 'sub_1'").get()).toEqual({ service_cycle_anchor: '2026-10-06' });
        expect(simulator.db.prepare("SELECT state, cycle_due_date FROM service_cycles WHERE id = 'historical_cycle'").get()).toEqual({ state: 'fulfilled', cycle_due_date: '2026-09-08' });
        expect(simulator.db.prepare("SELECT actor_id, actor_capacity, reason, correlation_key FROM service_cycle_events WHERE correlation_key = 'reanchor-1'").get())
            .toEqual({ actor_id: 'operator_1', actor_capacity: 'administration', reason: 'data_integrity', correlation_key: 'reanchor-1' });
        expect(stripe.state.metadata).toMatchObject({ service_day: 'TUE', service_cycle_anchor: '2026-10-06', service_day_reanchor_correlation_key: 'reanchor-1' });
    });

    it('builds a verified preview behind the application boundary', async () => {
        const operation = new ServiceDayReanchor(repository, stripe);

        await expect(operation.preview('sub_1', 'TUE')).resolves.toMatchObject({
            proposedAnchor: '2026-10-06',
            boundaryServiceDay: 'TUE',
            proposalAllowed: true,
            current: { subscriptionId: 'sub_1', serviceDay: 'MON' },
            stripe: { subscriptionId: 'stripe_sub_1' },
        });
    });

    it('rejects a preview when the proposed cycle is not materialized', async () => {
        const laterPeriodEnd = '2026-11-03T05:00:00.000Z';
        simulator.db.prepare("UPDATE subscriptions SET current_period_end = ? WHERE id = 'sub_1'").run(laterPeriodEnd);
        stripe.state = { ...stripe.state, currentPeriodEnd: laterPeriodEnd };
        const operation = new ServiceDayReanchor(repository, stripe);

        await expect(operation.preview('sub_1', 'TUE')).rejects.toThrow('proposed Service Cycle is not materialized');
    });

    it('rechecks the proposed cycle before any Stripe mutation', async () => {
        const operation = new ServiceDayReanchor({
            getSnapshot: repository.getSnapshot.bind(repository),
            hasServiceCycle: vi.fn().mockResolvedValue(false),
            hasAppliedReanchor: repository.hasAppliedReanchor.bind(repository),
            applyReanchor: repository.applyReanchor.bind(repository),
        }, stripe);

        await expect(operation.execute(input())).rejects.toThrow('proposed Service Cycle is not materialized');
        expect(stripe.update).not.toHaveBeenCalled();
    });

    it('is idempotent for a repeated correlation key', async () => {
        const operation = new ServiceDayReanchor(repository, stripe);
        await operation.execute(input());
        await expect(operation.execute(input())).resolves.toBe('already_applied');
        expect(stripe.update).toHaveBeenCalledTimes(1);
        expect(simulator.db.prepare("SELECT count(*) AS count FROM service_cycle_events WHERE correlation_key = 'reanchor-1'").get()).toEqual({ count: 1 });
    });

    it.each([
        ['an invalid weekday', { ...proposal, serviceDay: 'NOT_A_DAY' }, 'valid proposed Service Day'],
        ['a weekday-misaligned anchor', { ...proposal, serviceDay: 'WED' }, 'must match the proposed Service Day'],
    ])('rejects %s before either provider changes', async (_label, invalidProposal, message) => {
        const operation = new ServiceDayReanchor(repository, stripe);
        await expect(operation.execute(input({ proposal: invalidProposal }))).rejects.toThrow(message);
        expect(stripe.update).not.toHaveBeenCalled();
        expect(simulator.db.prepare("SELECT service_day FROM addresses WHERE id = 'addr_1'").get()).toEqual({ service_day: 'MON' });
    });

    it('rejects an unsupported cadence before Stripe changes', async () => {
        simulator.db.prepare("UPDATE subscriptions SET frequency_days = 30 WHERE id = 'sub_1'").run();
        const operation = new ServiceDayReanchor(repository, stripe);
        await expect(operation.execute(input())).rejects.toThrow('supported 28, 56, or 84');
        expect(stripe.update).not.toHaveBeenCalled();
    });

    it('stops before D1 when Stripe cannot update', async () => {
        stripe.update.mockRejectedValueOnce(new Error('Stripe unavailable'));
        const operation = new ServiceDayReanchor(repository, stripe);
        await expect(operation.execute(input())).rejects.toThrow('Stripe unavailable');
        expect(simulator.db.prepare("SELECT service_cycle_anchor FROM subscriptions WHERE id = 'sub_1'").get()).toEqual({ service_cycle_anchor: '2026-09-08' });
    });

    it('restores Stripe metadata when post-update verification fails', async () => {
        const getSubscription = vi.spyOn(stripe, 'getSubscription');
        getSubscription
            .mockImplementationOnce(async () => ({ ...stripe.state, metadata: { ...stripe.state.metadata } }))
            .mockRejectedValueOnce(new Error('Stripe verification unavailable'));
        const operation = new ServiceDayReanchor(repository, stripe);

        await expect(operation.execute(input())).rejects.toThrow('Stripe verification unavailable');
        expect(stripe.state.metadata).toEqual({
            service_day: 'MON',
            service_cycle_anchor: '2026-09-08',
        });
        expect(simulator.db.prepare("SELECT service_cycle_anchor FROM subscriptions WHERE id = 'sub_1'").get()).toEqual({ service_cycle_anchor: '2026-09-08' });
    });

    it('rejects a Stripe before-state mismatch before attempting either write', async () => {
        stripe.state = { ...stripe.state, currentPeriodEnd: '2026-11-03T05:00:00.000Z' };
        const operation = new ServiceDayReanchor(repository, stripe);

        await expect(operation.execute(input())).rejects.toThrow('does not match the verified D1 before-state');

        expect(stripe.update).not.toHaveBeenCalled();
        expect(simulator.db.prepare("SELECT service_day FROM addresses WHERE id = 'addr_1'").get()).toEqual({ service_day: 'MON' });
    });

    it('restores verified Stripe metadata when D1 fails and permits a retry', async () => {
        const failingRepository: ServiceDayReanchorRepository = {
            getSnapshot: repository.getSnapshot.bind(repository),
            hasServiceCycle: repository.hasServiceCycle.bind(repository),
            hasAppliedReanchor: repository.hasAppliedReanchor.bind(repository),
            applyReanchor: vi.fn().mockRejectedValue(new Error('D1 unavailable')),
        };
        const operation = new ServiceDayReanchor(failingRepository, stripe);
        await expect(operation.execute(input())).rejects.toThrow('D1 unavailable');
        expect(stripe.state.metadata).toEqual({ service_day: 'MON', service_cycle_anchor: '2026-09-08' });

        await expect(new ServiceDayReanchor(repository, stripe).execute(input())).resolves.toBe('applied');
    });

    it('surfaces an unverified Stripe state when inverse repair fails after D1 fails', async () => {
        const failingRepository: ServiceDayReanchorRepository = {
            getSnapshot: repository.getSnapshot.bind(repository),
            hasServiceCycle: repository.hasServiceCycle.bind(repository),
            hasAppliedReanchor: repository.hasAppliedReanchor.bind(repository),
            applyReanchor: vi.fn().mockRejectedValue(new Error('D1 unavailable')),
        };
        stripe.inverseFailure = new Error('inverse unavailable');
        const operation = new ServiceDayReanchor(failingRepository, stripe);

        await expect(operation.execute(input())).rejects.toThrow('unverified Stripe state');
        expect(simulator.db.prepare("SELECT service_cycle_anchor FROM subscriptions WHERE id = 'sub_1'").get()).toEqual({ service_cycle_anchor: '2026-09-08' });
    });

    it('rejects stale before-state without overwriting a newer change', async () => {
        simulator.db.prepare("UPDATE subscriptions SET service_cycle_anchor = '2026-10-13' WHERE id = 'sub_1'").run();
        const operation = new ServiceDayReanchor(repository, stripe);
        await expect(operation.execute(input())).rejects.toThrow('before-state is stale');
        expect(stripe.update).not.toHaveBeenCalled();
    });
});
