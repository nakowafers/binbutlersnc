import { beforeEach, describe, expect, it } from 'vitest';
import { DbSimulator } from './db-simulator';
import {
    applyMbAugust31RouteFallback,
    createMbAugust31RecoveryPlan,
    preflightMbAugust31RouteRecovery,
} from '@/lib/recovery/mbAugust31RouteRecovery';

const subscriptionId = 'sub_allowlisted';
const otherSubscriptionId = 'sub_other';
const date = '2026-08-31';

describe('M.B. August 31 route recovery', () => {
    let simulator: DbSimulator;

    beforeEach(() => {
        simulator = new DbSimulator();
        seedSubscription(subscriptionId);
        seedSubscription(otherSubscriptionId);
        simulator.db.prepare(
            "INSERT INTO sales_reps (id, email, is_admin, is_active) VALUES ('driver_1', 'driver@example.test', 1, 1)"
        ).run();
    });

    function seedSubscription(id: string) {
        const customerId = `cust_${id}`;
        simulator.db.prepare('INSERT INTO customers (id, email) VALUES (?, ?)').run(customerId, `${id}@example.test`);
        simulator.db.prepare('INSERT INTO addresses (id, customer_id, raw_address) VALUES (?, ?, ?)')
            .run(`addr_${id}`, customerId, `${id} route address`);
        simulator.db.prepare(
            "INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, 'active', 28)"
        ).run(id, customerId, `stripe_${id}`);
    }

    function plan() {
        return createMbAugust31RecoveryPlan({
            subscriptionId,
            allowlistedSubscriptionId: subscriptionId,
            cycleId: 'cycle_mb_20260831',
            historyId: 'attempt_mb_20260831',
            stopId: 'stop_mb_20260831',
            eventId: 'event_mb_20260831',
            driverSalesRepId: 'driver_1',
            routeSequenceOrder: 7,
            occurredAt: '2026-08-30T23:00:00.000Z',
        });
    }

    it('preflights empty expected rows and atomically creates one open cycle, pending attempt, assigned stop, and audit event', async () => {
        const recoveryPlan = plan();
        await expect(preflightMbAugust31RouteRecovery(simulator as unknown as D1Database, recoveryPlan)).resolves.toMatchObject({
            outcome: 'fallback_ready',
            counts: { subscriptions: 1, cycles: 0, pendingAttempts: 0, assignedStops: 0, auditEvents: 0 },
            inverseRepair: { kind: 'audited_correction_required' },
        });

        const result = await applyMbAugust31RouteFallback(simulator as unknown as D1Database, recoveryPlan);

        expect(result.outcome).toBe('fallback_applied');
        expect(result.postflight).toMatchObject({
            outcome: 'verified_noop',
            counts: { subscriptions: 1, cycles: 1, pendingAttempts: 1, assignedStops: 1, auditEvents: 1 },
        });
        expect(simulator.db.prepare('SELECT state FROM service_cycles WHERE id = ?').get('cycle_mb_20260831')).toEqual({ state: 'open' });
        expect(simulator.db.prepare('SELECT dispatch_status, completed_at FROM service_history WHERE id = ?').get('attempt_mb_20260831'))
            .toEqual({ dispatch_status: 'Pending', completed_at: null });
        expect(simulator.db.prepare('SELECT dispatch_status FROM dispatch_stops WHERE id = ?').get('stop_mb_20260831'))
            .toEqual({ dispatch_status: 'assigned' });
        expect(simulator.db.prepare('SELECT * FROM service_cycle_events WHERE id = ?').get('event_mb_20260831')).toMatchObject({ event_type: 'created', to_state: 'open' });
        expect(simulator.db.prepare("SELECT count(*) AS count FROM service_history WHERE dispatch_status = 'Completed'").get()).toEqual({ count: 0 });
    });

    it('reports a verified no-op when normal scheduling already created the linked route work', async () => {
        const recoveryPlan = plan();
        await applyMbAugust31RouteFallback(simulator as unknown as D1Database, recoveryPlan);

        await expect(preflightMbAugust31RouteRecovery(simulator as unknown as D1Database, recoveryPlan)).resolves.toMatchObject({
            outcome: 'verified_noop',
            counts: { subscriptions: 1, cycles: 1, pendingAttempts: 1, assignedStops: 1, auditEvents: 1 },
        });
    });

    it('is idempotent on a duplicate fallback execution without creating more route work', async () => {
        const recoveryPlan = plan();
        await applyMbAugust31RouteFallback(simulator as unknown as D1Database, recoveryPlan);

        await expect(applyMbAugust31RouteFallback(simulator as unknown as D1Database, recoveryPlan)).resolves.toMatchObject({ outcome: 'verified_noop' });
        expect(simulator.db.prepare('SELECT * FROM service_cycles').all()).toHaveLength(1);
        expect(simulator.db.prepare('SELECT * FROM service_history').all()).toHaveLength(1);
        expect(simulator.db.prepare('SELECT * FROM dispatch_stops').all()).toHaveLength(1);
        expect(simulator.db.prepare('SELECT * FROM service_cycle_events').all()).toHaveLength(1);
    });

    it('rejects a subscription that is not exactly allowlisted before reading or writing', async () => {
        await expect(Promise.resolve().then(() => createMbAugust31RecoveryPlan({
            ...plan(), subscriptionId: otherSubscriptionId,
        })))
            .rejects.toThrow('exact allowlisted Subscription');
        expect(simulator.db.prepare('SELECT * FROM service_cycles').all()).toHaveLength(0);
    });

    it('fails closed and rolls back when a paired write fails', async () => {
        const recoveryPlan = plan();
        simulator.db.prepare("INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES ('other_cycle', ?, '2026-08-03', 'open')").run(otherSubscriptionId);
        simulator.db.prepare("INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, correlation_key) VALUES ('other_event', 'other_cycle', 'created', NULL, 'open', 'system', 'system', '2026-08-01T00:00:00.000Z', ?)").run(recoveryPlan.correlationKey);

        await expect(applyMbAugust31RouteFallback(simulator as unknown as D1Database, recoveryPlan)).rejects.toThrow();
        expect(simulator.db.prepare('SELECT * FROM service_cycles').all()).toHaveLength(1);
        expect(simulator.db.prepare('SELECT * FROM service_history').all()).toHaveLength(0);
        expect(simulator.db.prepare('SELECT * FROM dispatch_stops').all()).toHaveLength(0);
        expect(simulator.db.prepare('SELECT * FROM service_cycle_events').all()).toHaveLength(1);
    });

    it('fails closed on partial pre-existing route work and supplies a non-destructive inverse repair plan', async () => {
        simulator.db.prepare(
            "INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, cycle_due_date) VALUES ('partial_attempt', ?, ?, 'Pending', ?)"
        ).run(subscriptionId, date, date);

        await expect(preflightMbAugust31RouteRecovery(simulator as unknown as D1Database, plan()))
            .resolves.toMatchObject({ outcome: 'mismatch', inverseRepair: { kind: 'audited_correction_required', retainAuditEvidence: true } });
        await expect(applyMbAugust31RouteFallback(simulator as unknown as D1Database, plan())).rejects.toThrow('preflight mismatch');
        expect(simulator.db.prepare('SELECT * FROM service_cycles').all()).toHaveLength(0);
        expect(simulator.db.prepare('SELECT * FROM service_history').all()).toHaveLength(1);
    });
});
