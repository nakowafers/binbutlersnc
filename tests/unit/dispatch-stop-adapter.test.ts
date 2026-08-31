import { describe, expect, it } from 'vitest';
import { createTestD1 } from '../db-helper';
import { D1DispatchStopRepositoryAdapter } from '../../src/lib/db/adapters/D1DispatchStopRepositoryAdapter';

function linkedStop() {
    return {
        id: 'stop_1', subscriptionId: 'sub_1', serviceHistoryId: 'hist_1', serviceDate: '2026-07-15',
        driverSalesRepId: 'DRIVER', routeSequenceOrder: 1, customerName: null, rawAddress: '123 Main St',
        latitude: null, longitude: null, binCount: 1, customerScent: null, serviceNotes: null, customerPhone: null,
        serviceCycleId: 'cycle_1', cycleDueDate: '2026-07-15',
    };
}

async function seedBase(d1Mock: D1Database) {
    await d1Mock.prepare("INSERT INTO sales_reps (id, email, is_admin, is_active) VALUES ('DRIVER', 'driver@example.com', 1, 1)").run();
    await d1Mock.prepare("INSERT INTO customers (id, email) VALUES ('cust_1', 'customer@example.com')").run();
    await d1Mock.prepare("INSERT INTO subscriptions (id, customer_id, status, frequency_days) VALUES ('sub_1', 'cust_1', 'active', 28)").run();
    await d1Mock.prepare("INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES ('hist_1', 'sub_1', '2026-07-15', 'Pending')").run();
}

describe('D1DispatchStopRepositoryAdapter', () => {
    it('fulfills a linked Service Cycle with the actual Eastern Service Date and Completed At', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        await d1Mock.batch([
            d1Mock.prepare("INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES ('cycle_1', 'sub_1', '2026-07-15', 'open')"),
            d1Mock.prepare("INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, correlation_key) VALUES ('cycle_created', 'cycle_1', 'created', NULL, 'open', 'system', 'system', '2026-07-14T00:00:00.000Z', 'cycle-created')"),
            d1Mock.prepare("UPDATE service_history SET service_cycle_id = 'cycle_1', cycle_due_date = '2026-07-15' WHERE id = 'hist_1'"),
        ]);
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        await repo.createDispatchStops([linkedStop()]);

        await repo.markDispatchStopCompleted('stop_1', 'DRIVER', '2026-07-16T02:00:00.000Z');

        expect(await d1Mock.prepare("SELECT state FROM service_cycles WHERE id = 'cycle_1'").first()).toEqual({ state: 'fulfilled' });
        expect(await d1Mock.prepare("SELECT service_date, completed_at, dispatch_status FROM service_history WHERE id = 'hist_1'").first())
            .toEqual({ service_date: '2026-07-15', completed_at: '2026-07-16T02:00:00.000Z', dispatch_status: 'Completed' });
        expect(await d1Mock.prepare("SELECT actor_id, actor_capacity, from_state, to_state FROM service_cycle_events WHERE service_cycle_id = 'cycle_1' AND event_type = 'transition'").first())
            .toEqual({ actor_id: 'DRIVER', actor_capacity: 'fulfillment', from_state: 'open', to_state: 'fulfilled' });
    });

    it('turns a linked skipped attempt into an exception with a controlled reason', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        await d1Mock.batch([
            d1Mock.prepare("INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES ('cycle_1', 'sub_1', '2026-07-15', 'open')"),
            d1Mock.prepare("INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, correlation_key) VALUES ('cycle_created', 'cycle_1', 'created', NULL, 'open', 'system', 'system', '2026-07-14T00:00:00.000Z', 'cycle-created')"),
            d1Mock.prepare("UPDATE service_history SET service_cycle_id = 'cycle_1', cycle_due_date = '2026-07-15' WHERE id = 'hist_1'"),
        ]);
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        await repo.createDispatchStops([linkedStop()]);

        await repo.skipDispatchStop('stop_1', 'DRIVER', 'bins_not_out', '2026-07-15T10:00:00.000Z');

        expect(await d1Mock.prepare("SELECT state FROM service_cycles WHERE id = 'cycle_1'").first()).toEqual({ state: 'exception' });
        expect(await d1Mock.prepare("SELECT reason, actor_capacity FROM service_cycle_events WHERE service_cycle_id = 'cycle_1' AND event_type = 'transition'").first())
            .toEqual({ reason: 'bins_not_out', actor_capacity: 'fulfillment' });
    });

    it('rejects an uncontrolled linked skip without changing its attempt or creating follow-up work', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        await d1Mock.batch([
            d1Mock.prepare("INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES ('cycle_1', 'sub_1', '2026-07-15', 'open')"),
            d1Mock.prepare("INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, correlation_key) VALUES ('cycle_created', 'cycle_1', 'created', NULL, 'open', 'system', 'system', '2026-07-14T00:00:00.000Z', 'cycle-created')"),
            d1Mock.prepare("UPDATE service_history SET service_cycle_id = 'cycle_1', cycle_due_date = '2026-07-15' WHERE id = 'hist_1'"),
        ]);
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        await repo.createDispatchStops([linkedStop()]);

        await expect(repo.skipDispatchStop('stop_1', 'DRIVER', 'Gate locked', '2026-07-15T10:00:00.000Z')).rejects.toThrow('controlled');

        expect((await d1Mock.prepare("SELECT dispatch_status FROM dispatch_stops WHERE id = 'stop_1'").first())).toEqual({ dispatch_status: 'assigned' });
        expect((await d1Mock.prepare("SELECT dispatch_status FROM service_history WHERE id = 'hist_1'").first())).toEqual({ dispatch_status: 'Pending' });
        expect((await d1Mock.prepare("SELECT COUNT(*) AS count FROM dispatch_stops WHERE service_cycle_id = 'cycle_1'").first())).toEqual({ count: 1 });
    });
    it('creates and queries active route stops by driver and date', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);

        await repo.createDispatchStops([{
            id: 'stop_1',
            subscriptionId: 'sub_1',
            serviceHistoryId: 'hist_1',
            serviceDate: '2026-07-15',
            driverSalesRepId: 'DRIVER',
            routeSequenceOrder: 2,
            customerName: 'Test Customer',
            rawAddress: '123 Main St',
            latitude: 34.1,
            longitude: -77.9,
            binCount: 2,
            customerScent: 'lavender',
            serviceNotes: 'Gate code 1234',
            customerPhone: '9105550101',
        }]);

        const stops = await repo.getRouteStops('DRIVER', '2026-07-15');

        expect(stops).toHaveLength(1);
        expect(stops[0]).toMatchObject({
            id: 'stop_1',
            dispatch_status: 'assigned',
            customer_name: 'Test Customer',
            bin_count: 2,
        });
    });

    it('creates route work and clears consumed first-service dates together', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        await d1Mock.prepare("UPDATE subscriptions SET next_service_date = '2026-07-15' WHERE id = 'sub_1'").run();
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);

        await repo.createDispatchRoute({
            history: [],
            stops: [{
                id: 'stop_1',
                subscriptionId: 'sub_1',
                serviceHistoryId: 'hist_1',
                serviceDate: '2026-07-15',
                driverSalesRepId: 'DRIVER',
                routeSequenceOrder: 1,
                customerName: null,
                rawAddress: '123 Main St',
                latitude: null,
                longitude: null,
                binCount: 1,
                customerScent: null,
                serviceNotes: null,
                customerPhone: null,
            }],
            consumedFirstService: {
                subscriptionIds: ['sub_1'],
                serviceDate: '2026-07-15',
            },
        });

        const subscription = await d1Mock.prepare(
            "SELECT next_service_date FROM subscriptions WHERE id = 'sub_1'"
        ).first<{ next_service_date: string | null }>();
        const stops = await repo.getRouteStops('DRIVER', '2026-07-15');

        expect(stops).toHaveLength(1);
        expect(subscription?.next_service_date).toBeNull();
    });

    it('reuses a recurring shadow cycle and linked route work across repeated route writes', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        const route = {
            cycles: [{
                id: 'shadow-cycle:sub_1:2026-07-15', subscriptionId: 'sub_1', cycleDueDate: '2026-07-15',
                eventId: 'shadow-cycle-created:sub_1:2026-07-15', occurredAt: '2026-07-14T21:00:00.000Z', correlationKey: 'shadow-dispatch:sub_1:2026-07-15',
            }],
            history: [{
                id: 'shadow-history:sub_1:2026-07-15', subscriptionId: 'sub_1', date: '2026-07-15', status: 'Pending',
                serviceCycleId: 'shadow-cycle:sub_1:2026-07-15', cycleDueDate: '2026-07-15',
            }],
            stops: [{
                id: 'shadow-stop:sub_1:2026-07-15', subscriptionId: 'sub_1', serviceHistoryId: 'shadow-history:sub_1:2026-07-15',
                serviceDate: '2026-07-15', driverSalesRepId: 'DRIVER', routeSequenceOrder: 1, customerName: null,
                rawAddress: '123 Main St', latitude: null, longitude: null, binCount: 1, customerScent: null,
                serviceNotes: null, customerPhone: null, serviceCycleId: 'shadow-cycle:sub_1:2026-07-15', cycleDueDate: '2026-07-15',
            }],
        };

        await Promise.all([repo.createDispatchRoute(route), repo.createDispatchRoute(route)]);

        expect((await d1Mock.prepare('SELECT * FROM service_cycles').all()).results).toHaveLength(1);
        expect((await d1Mock.prepare('SELECT * FROM service_cycle_events').all()).results).toHaveLength(1);
        expect((await d1Mock.prepare("SELECT * FROM service_history WHERE id = 'shadow-history:sub_1:2026-07-15'").all()).results).toHaveLength(1);
        expect((await d1Mock.prepare("SELECT * FROM dispatch_stops WHERE id = 'shadow-stop:sub_1:2026-07-15'").all()).results).toHaveLength(1);
    });

    it('completes a stop and updates service history', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        await repo.createDispatchStops([{
            id: 'stop_1',
            subscriptionId: 'sub_1',
            serviceHistoryId: 'hist_1',
            serviceDate: '2026-07-15',
            driverSalesRepId: 'DRIVER',
            routeSequenceOrder: 1,
            customerName: null,
            rawAddress: '123 Main St',
            latitude: null,
            longitude: null,
            binCount: 1,
            customerScent: null,
            serviceNotes: null,
            customerPhone: null,
        }]);

        await repo.markDispatchStopCompleted('stop_1', 'DRIVER', '2026-07-15T10:00:00.000Z');

        expect(await repo.getRouteStops('DRIVER', '2026-07-15')).toEqual([]);
        const history = await d1Mock.prepare("SELECT dispatch_status, service_date FROM service_history WHERE id = 'hist_1'").first<{ dispatch_status: string; service_date: string }>();
        expect(history?.dispatch_status).toBe('Completed');
        expect(history?.service_date).toBe('2026-07-15');
    });

    it('completes only the service history linked to the acted-on stop', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        await d1Mock.prepare("INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES ('orphan_pending', 'sub_1', '2026-07-01', 'Pending')").run();
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        await repo.createDispatchStops([{
            id: 'stop_1',
            subscriptionId: 'sub_1',
            serviceHistoryId: 'hist_1',
            serviceDate: '2026-07-15',
            driverSalesRepId: 'DRIVER',
            routeSequenceOrder: 1,
            customerName: null,
            rawAddress: '123 Main St',
            latitude: null,
            longitude: null,
            binCount: 1,
            customerScent: null,
            serviceNotes: null,
            customerPhone: null,
        }]);

        await repo.markDispatchStopCompleted('stop_1', 'DRIVER', '2026-07-15T10:00:00.000Z');

        const historyRows = await d1Mock.prepare(
            'SELECT id, dispatch_status FROM service_history ORDER BY id'
        ).all<{ id: string; dispatch_status: string }>();
        expect(historyRows.results).toEqual([
            { id: 'hist_1', dispatch_status: 'Completed' },
            { id: 'orphan_pending', dispatch_status: 'Pending' },
        ]);
    });

    it('skips a stop with a reason and updates service history', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        await repo.createDispatchStops([{
            id: 'stop_1',
            subscriptionId: 'sub_1',
            serviceHistoryId: 'hist_1',
            serviceDate: '2026-07-15',
            driverSalesRepId: 'DRIVER',
            routeSequenceOrder: 1,
            customerName: null,
            rawAddress: '123 Main St',
            latitude: null,
            longitude: null,
            binCount: 1,
            customerScent: null,
            serviceNotes: null,
            customerPhone: null,
        }]);

        await repo.skipDispatchStop('stop_1', 'DRIVER', 'Gate locked', '2026-07-15T10:00:00.000Z');

        const stop = await repo.getStopById('stop_1');
        const history = await d1Mock.prepare("SELECT dispatch_status, service_date FROM service_history WHERE id = 'hist_1'").first<{ dispatch_status: string; service_date: string }>();
        expect(stop?.dispatch_status).toBe('skipped');
        expect(stop?.skip_reason).toBe('Gate locked');
        expect(history?.dispatch_status).toBe('Skipped');
        expect(history?.service_date).toBe('2026-07-15');
    });

    it('skips only the service history linked to the acted-on stop', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        await d1Mock.prepare("INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES ('orphan_pending', 'sub_1', '2026-07-01', 'Pending')").run();
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        await repo.createDispatchStops([{
            id: 'stop_1',
            subscriptionId: 'sub_1',
            serviceHistoryId: 'hist_1',
            serviceDate: '2026-07-15',
            driverSalesRepId: 'DRIVER',
            routeSequenceOrder: 1,
            customerName: null,
            rawAddress: '123 Main St',
            latitude: null,
            longitude: null,
            binCount: 1,
            customerScent: null,
            serviceNotes: null,
            customerPhone: null,
        }]);

        await repo.skipDispatchStop('stop_1', 'DRIVER', 'Gate locked', '2026-07-15T10:00:00.000Z');

        const historyRows = await d1Mock.prepare(
            'SELECT id, dispatch_status FROM service_history ORDER BY id'
        ).all<{ id: string; dispatch_status: string }>();
        expect(historyRows.results).toEqual([
            { id: 'hist_1', dispatch_status: 'Skipped' },
            { id: 'orphan_pending', dispatch_status: 'Pending' },
        ]);
    });

    it('does not change a terminal skipped stop to completed', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        await repo.createDispatchStops([{
            id: 'stop_1',
            subscriptionId: 'sub_1',
            serviceHistoryId: 'hist_1',
            serviceDate: '2026-07-15',
            driverSalesRepId: 'DRIVER',
            routeSequenceOrder: 1,
            customerName: null,
            rawAddress: '123 Main St',
            latitude: null,
            longitude: null,
            binCount: 1,
            customerScent: null,
            serviceNotes: null,
            customerPhone: null,
        }]);
        await repo.skipDispatchStop('stop_1', 'DRIVER', 'Gate locked', '2026-07-15T10:00:00.000Z');

        await repo.markDispatchStopCompleted('stop_1', 'DRIVER', '2026-07-15T11:00:00.000Z');

        const stop = await repo.getStopById('stop_1');
        const history = await d1Mock.prepare("SELECT dispatch_status FROM service_history WHERE id = 'hist_1'").first<{ dispatch_status: string }>();
        expect(stop?.dispatch_status).toBe('skipped');
        expect(history?.dispatch_status).toBe('Skipped');
    });

    it('does not change a terminal completed stop to skipped', async () => {
        const { d1Mock } = createTestD1();
        await seedBase(d1Mock as unknown as D1Database);
        const repo = new D1DispatchStopRepositoryAdapter(d1Mock as unknown as D1Database);
        await repo.createDispatchStops([{
            id: 'stop_1',
            subscriptionId: 'sub_1',
            serviceHistoryId: 'hist_1',
            serviceDate: '2026-07-15',
            driverSalesRepId: 'DRIVER',
            routeSequenceOrder: 1,
            customerName: null,
            rawAddress: '123 Main St',
            latitude: null,
            longitude: null,
            binCount: 1,
            customerScent: null,
            serviceNotes: null,
            customerPhone: null,
        }]);
        await repo.markDispatchStopCompleted('stop_1', 'DRIVER', '2026-07-15T10:00:00.000Z');

        await repo.skipDispatchStop('stop_1', 'DRIVER', 'Gate locked', '2026-07-15T11:00:00.000Z');

        const stop = await repo.getStopById('stop_1');
        const history = await d1Mock.prepare("SELECT dispatch_status FROM service_history WHERE id = 'hist_1'").first<{ dispatch_status: string }>();
        expect(stop?.dispatch_status).toBe('completed');
        expect(history?.dispatch_status).toBe('Completed');
    });
});
