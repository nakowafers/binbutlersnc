import { describe, expect, it } from 'vitest';
import { createTestD1 } from '../db-helper';
import { D1DispatchStopRepositoryAdapter } from '../../src/lib/db/adapters/D1DispatchStopRepositoryAdapter';

async function seedBase(d1Mock: D1Database) {
    await d1Mock.prepare("INSERT INTO sales_reps (id, email, is_admin, is_active) VALUES ('DRIVER', 'driver@example.com', 1, 1)").run();
    await d1Mock.prepare("INSERT INTO customers (id, email) VALUES ('cust_1', 'customer@example.com')").run();
    await d1Mock.prepare("INSERT INTO subscriptions (id, customer_id, status, frequency_days) VALUES ('sub_1', 'cust_1', 'active', 28)").run();
    await d1Mock.prepare("INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES ('hist_1', 'sub_1', '2026-07-15', 'Pending')").run();
}

describe('D1DispatchStopRepositoryAdapter', () => {
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
        const history = await d1Mock.prepare("SELECT dispatch_status FROM service_history WHERE id = 'hist_1'").first<{ dispatch_status: string }>();
        expect(history?.dispatch_status).toBe('Completed');
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
        const history = await d1Mock.prepare("SELECT dispatch_status FROM service_history WHERE id = 'hist_1'").first<{ dispatch_status: string }>();
        expect(stop?.dispatch_status).toBe('skipped');
        expect(stop?.skip_reason).toBe('Gate locked');
        expect(history?.dispatch_status).toBe('Skipped');
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
