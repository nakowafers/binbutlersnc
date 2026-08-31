import { beforeEach, describe, expect, it } from 'vitest';
import { D1ServiceCycleRepositoryAdapter } from '@/lib/db/adapters/D1ServiceCycleRepositoryAdapter';
import { ServiceCycleInvariantError } from '@/lib/service-cycle/invariants';
import { SERVICE_CYCLE_INVARIANT_AUDIT_SQL } from '@/lib/reports/serviceCycleInvariantAudit';
import { DbSimulator } from './db-simulator';

describe('Service Cycle invariant enforcement', () => {
    let simulator: DbSimulator;
    let repository: D1ServiceCycleRepositoryAdapter;

    beforeEach(() => {
        simulator = new DbSimulator();
        simulator.db.prepare('INSERT INTO customers (id, email) VALUES (?, ?)').run('customer_invariant', 'invariant@example.com');
        simulator.db.prepare('INSERT INTO subscriptions (id, customer_id, status, frequency_days) VALUES (?, ?, ?, ?)').run('subscription_invariant', 'customer_invariant', 'active', 28);
        repository = new D1ServiceCycleRepositoryAdapter(simulator as unknown as D1Database);
    });

    const input = (overrides: Record<string, unknown> = {}) => ({
        id: 'cycle_invariant', subscriptionId: 'subscription_invariant', cycleDueDate: '2026-09-01',
        actor: { id: 'system', capacity: 'system' as const }, occurredAt: '2026-08-31T23:00:00.000Z',
        correlationKey: 'invariant-create', eventId: 'invariant-created', ...overrides,
    });

    it('accepts exact cadence anniversaries and rejects timestamp-shaped cycle-linked dates', async () => {
        await repository.createCycle(input());
        await expect(repository.createCycle(input({ id: 'timestamp-cycle', cycleDueDate: '2026-09-29T00:00:00.000Z', correlationKey: 'timestamp-cycle', eventId: 'timestamp-cycle-event' })))
            .rejects.toThrow('canonical Eastern Service Date');

        expect(() => simulator.db.prepare(
            "INSERT INTO service_history (id, subscription_id, service_cycle_id, cycle_due_date, service_date, dispatch_status) VALUES ('timestamp-history', 'subscription_invariant', 'cycle_invariant', '2026-09-01', '2026-09-01T12:00:00.000Z', 'Pending')",
        ).run()).toThrow('service_cycle_invalid_date');
        expect(() => simulator.db.prepare(
            "INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES ('legacy-timestamp-history', 'subscription_invariant', '2026-09-01T12:00:00.000Z', 'Completed')",
        ).run()).not.toThrow();
    });

    it('prevents duplicate obligations and more than one successful completion per cycle', async () => {
        await repository.createCycle(input());
        await expect(repository.createCycle(input({ id: 'duplicate-cycle', correlationKey: 'duplicate-cycle', eventId: 'duplicate-cycle-event' })))
            .rejects.toMatchObject({ name: 'ServiceCycleInvariantError', code: 'duplicate_cycle' });

        simulator.db.prepare(
            "INSERT INTO service_history (id, subscription_id, service_cycle_id, cycle_due_date, service_date, dispatch_status) VALUES ('completed-one', 'subscription_invariant', 'cycle_invariant', '2026-09-01', '2026-09-01', 'Completed')",
        ).run();
        expect(() => simulator.db.prepare(
            "INSERT INTO service_history (id, subscription_id, service_cycle_id, cycle_due_date, service_date, dispatch_status) VALUES ('completed-two', 'subscription_invariant', 'cycle_invariant', '2026-09-01', '2026-09-02', 'Completed')",
        ).run()).toThrow('service_history.service_cycle_id');
    });

    it('fails closed with a PII-free actionable error on a concurrent transition', async () => {
        await repository.createCycle(input());
        const transition = (key: string) => repository.transitionCycle({
            cycleId: 'cycle_invariant', toState: 'fulfilled', actor: { id: 'operator', capacity: 'fulfillment' },
            occurredAt: '2026-09-01T20:00:00.000Z', correlationKey: key, eventId: `${key}-event`,
        });

        const results = await Promise.allSettled([transition('complete-a'), transition('complete-b')]);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        expect(rejected?.reason).toBeInstanceOf(ServiceCycleInvariantError);
        expect(rejected?.reason.message).toMatch(/concurrently; re-read/i);
        expect(rejected?.reason.message).not.toMatch(/customer_invariant|invariant@example.com/i);
    });

    it('accepts a persisted needs_review classification instead of requiring a guessed anchor', () => {
        const before = simulator.db.prepare(SERVICE_CYCLE_INVARIANT_AUDIT_SQL).all() as Array<{ finding: string; subscription_id: string }>;
        expect(before).toContainEqual(expect.objectContaining({
            finding: 'recurring_anchor_review_required',
            subscription_id: 'subscription_invariant',
        }));

        simulator.db.prepare(
            `INSERT INTO subscription_recovery_reviews (subscription_id, classification, reason, observed_at)
             VALUES (?, 'needs_review', 'missing_anchor', ?)`,
        ).run('subscription_invariant', '2026-08-30T12:00:00.000Z');

        const after = simulator.db.prepare(SERVICE_CYCLE_INVARIANT_AUDIT_SQL).all() as Array<{ finding: string; subscription_id: string }>;
        expect(after).not.toContainEqual(expect.objectContaining({
            finding: 'recurring_anchor_review_required',
            subscription_id: 'subscription_invariant',
        }));
    });
});
