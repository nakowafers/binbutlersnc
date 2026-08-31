import { beforeEach, describe, expect, it } from 'vitest';
import { ServiceCycleActions } from '@/lib/service-cycle/ServiceCycleActions';
import { createTestD1 } from '../db-helper';

describe('ServiceCycleActions', () => {
    let d1: D1Database;
    let actions: ServiceCycleActions;

    beforeEach(async () => {
        const { d1Mock } = createTestD1();
        d1 = d1Mock as unknown as D1Database;
        await d1.batch([
            d1.prepare("INSERT INTO sales_reps (id, email, is_admin, is_active) VALUES ('operator_1', 'operator@example.com', 1, 1)"),
            d1.prepare("INSERT INTO customers (id, email) VALUES ('customer_1', 'cycle@example.com')"),
            d1.prepare("INSERT INTO subscriptions (id, customer_id, status, frequency_days) VALUES ('subscription_1', 'customer_1', 'active', 28)"),
            d1.prepare("INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES ('cycle_1', 'subscription_1', '2026-09-01', 'exception')"),
            d1.prepare("INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, correlation_key) VALUES ('cycle-created', 'cycle_1', 'created', NULL, 'open', 'system', 'system', '2026-08-31T12:00:00.000Z', 'cycle-created')"),
            d1.prepare("INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, reason, correlation_key) VALUES ('attempt-skipped', 'cycle_1', 'transition', 'open', 'exception', 'operator_1', 'fulfillment', '2026-09-01T15:00:00.000Z', 'bins_not_out', 'attempt-skipped')"),
            d1.prepare("INSERT INTO service_history (id, subscription_id, service_cycle_id, cycle_due_date, service_date, dispatch_status, bin_quantity) VALUES ('history_1', 'subscription_1', 'cycle_1', '2026-09-01', '2026-09-01', 'Skipped', 2)"),
            d1.prepare("INSERT INTO dispatch_stops (id, subscription_id, service_history_id, service_cycle_id, cycle_due_date, service_date, driver_sales_rep_id, dispatch_status, raw_address, bin_count) VALUES ('stop_1', 'subscription_1', 'history_1', 'cycle_1', '2026-09-01', '2026-09-01', 'operator_1', 'skipped', '123 Main St', 2)"),
        ]);
        actions = new ServiceCycleActions(d1);
    });

    const catchUp = () => actions.approveCatchUpService({
        cycleId: 'cycle_1', serviceDate: '2026-09-03', actor: { id: 'operator_1', capacity: 'administration' }, occurredAt: '2026-09-02T12:00:00.000Z',
    });

    it('approves one pending catch-up attempt without moving the original cycle due date', async () => {
        await catchUp();

        expect(await d1.prepare("SELECT state, cycle_due_date FROM service_cycles WHERE id = 'cycle_1'").first()).toEqual({ state: 'open', cycle_due_date: '2026-09-01' });
        expect(await d1.prepare("SELECT service_date, cycle_due_date, dispatch_status, completed_at FROM service_history WHERE id = 'catch-up-history:cycle_1:2026-09-03'").first())
            .toEqual({ service_date: '2026-09-03', cycle_due_date: '2026-09-01', dispatch_status: 'Pending', completed_at: null });
        expect(await d1.prepare("SELECT service_date, cycle_due_date, dispatch_status FROM dispatch_stops WHERE id = 'catch-up-stop:cycle_1:2026-09-03'").first())
            .toEqual({ service_date: '2026-09-03', cycle_due_date: '2026-09-01', dispatch_status: 'assigned' });
    });

    it('replays catch-up approval without creating another attempt', async () => {
        await catchUp();
        await catchUp();

        expect(await d1.prepare("SELECT COUNT(*) AS count FROM service_history WHERE service_cycle_id = 'cycle_1'").first()).toEqual({ count: 2 });
        expect(await d1.prepare("SELECT COUNT(*) AS count FROM dispatch_stops WHERE service_cycle_id = 'cycle_1'").first()).toEqual({ count: 2 });
    });

    it('rejects an occupied catch-up target date', async () => {
        await d1.batch([
            d1.prepare("INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES ('conflict-history', 'subscription_1', '2026-09-03', 'Pending')"),
            d1.prepare("INSERT INTO dispatch_stops (id, subscription_id, service_history_id, service_date, driver_sales_rep_id, dispatch_status, raw_address) VALUES ('conflict-stop', 'subscription_1', 'conflict-history', '2026-09-03', 'operator_1', 'assigned', '123 Main St')"),
        ]);

        await expect(catchUp()).rejects.toThrow('already has route work');
        expect(await d1.prepare("SELECT state FROM service_cycles WHERE id = 'cycle_1'").first()).toEqual({ state: 'exception' });
    });

    it('rejects invalid catch-up state, date, and non-administration actors without creating work', async () => {
        await expect(actions.approveCatchUpService({
            cycleId: 'cycle_1', serviceDate: '2026-09-03', actor: { id: 'operator_1', capacity: 'fulfillment' }, occurredAt: '2026-09-02T12:00:00.000Z',
        })).rejects.toThrow('Only administration');
        await expect(actions.approveCatchUpService({
            cycleId: 'cycle_1', serviceDate: '09/03/2026', actor: { id: 'operator_1', capacity: 'administration' }, occurredAt: '2026-09-02T12:00:00.000Z',
        })).rejects.toThrow('canonical Eastern Service Date');
        await actions.waiveServiceCycle({
            cycleId: 'cycle_1', reason: 'customer_request', notes: 'Customer declined the cycle.', actor: { id: 'operator_1', capacity: 'administration' }, occurredAt: '2026-09-02T12:00:00.000Z',
        });
        await expect(catchUp()).rejects.toThrow('Only an exception');
        expect(await d1.prepare("SELECT COUNT(*) AS count FROM dispatch_stops WHERE service_cycle_id = 'cycle_1'").first()).toEqual({ count: 1 });
    });

    it('waives an exception once with required audited notes', async () => {
        const input = {
            cycleId: 'cycle_1', reason: 'customer_request' as const, notes: 'Customer declined the cycle.', actor: { id: 'operator_1', capacity: 'administration' as const }, occurredAt: '2026-09-02T12:00:00.000Z',
        };
        await actions.waiveServiceCycle(input);
        await actions.waiveServiceCycle(input);

        expect(await d1.prepare("SELECT state FROM service_cycles WHERE id = 'cycle_1'").first()).toEqual({ state: 'waived' });
        expect(await d1.prepare("SELECT COUNT(*) AS count FROM service_cycle_events WHERE service_cycle_id = 'cycle_1'").first()).toEqual({ count: 3 });
    });
});
