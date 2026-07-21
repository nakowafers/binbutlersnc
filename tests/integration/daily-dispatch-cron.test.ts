import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dailyDispatchCron from '../../workers/daily-dispatch-cron/index';
import { DbSimulator } from './db-simulator';

describe('Daily Dispatch Cron Worker - Local Dispatch', () => {
    let simulator: DbSimulator;
    let mockEnv: any;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-05-13T12:00:00Z'));
        simulator = new DbSimulator();
        mockEnv = {
            DB: simulator,
            GEOAPIFY_API_KEY: '',
        };
        simulator.db.prepare(
            "INSERT INTO sales_reps (id, email, is_admin, is_active) VALUES ('DRIVER', 'driver@example.com', 1, 1)"
        ).run();
        simulator.db.prepare(
            "INSERT INTO global_settings (key, value) VALUES ('default_driver_sales_rep_id', 'DRIVER'), ('route_depot_address', 'Wilmington, NC'), ('route_depot_lat', '34.2257'), ('route_depot_lng', '-77.9447')"
        ).run();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function seedSubscription(id: string, serviceDay = 'TUE') {
        const customerId = `cust_${id}`;
        const addressId = `addr_${id}`;
        simulator.db.prepare(
            'INSERT INTO customers (id, email, first_name, last_name, phone_number, bin_quantity) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(customerId, `${id}@example.com`, 'Test', id, '(910) 555-0101', 2);
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day, notes, scent_preference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(addressId, customerId, `${id} Main St`, 35.1, -80.1, serviceDay, serviceDay, 'Gate code 1234', 'lavender');
        simulator.db.prepare('UPDATE customers SET address_id = ? WHERE id = ?').run(addressId, customerId);
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(`sub_${id}`, customerId, `stripe_${id}`, 'active', '2026-06-20T00:00:00.000Z', 28);
    }

    function seedSubscriptionWithOptions(id: string, options: {
        serviceDay?: string;
        status?: string;
        currentPeriodEnd?: string;
        latitude?: number | null;
        longitude?: number | null;
    } = {}) {
        const customerId = `cust_${id}`;
        const addressId = `addr_${id}`;
        const serviceDay = options.serviceDay || 'TUE';
        simulator.db.prepare(
            'INSERT INTO customers (id, email, first_name, last_name, phone_number, bin_quantity) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(customerId, `${id}@example.com`, 'Test', id, '(910) 555-0101', 2);
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day, notes, scent_preference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            addressId,
            customerId,
            `${id} Main St`,
            options.latitude === undefined ? 35.1 : options.latitude,
            options.longitude === undefined ? -80.1 : options.longitude,
            serviceDay,
            serviceDay,
            'Gate code 1234',
            'lavender'
        );
        simulator.db.prepare('UPDATE customers SET address_id = ? WHERE id = ?').run(addressId, customerId);
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(`sub_${id}`, customerId, `stripe_${id}`, options.status || 'active', options.currentPeriodEnd || '2026-06-20T00:00:00.000Z', 28);
    }

    it.each([
        ['daylight time', '2024-05-14T00:00:00.000Z', '2024-05-14'],
        ['standard time', '2024-11-05T00:00:00.000Z', '2024-11-05'],
    ])('dispatches due Tuesday Service Day subscriptions from an explicit 00:00 UTC scheduled timestamp during %s', async (_label, scheduledTimeIso, expectedServiceDate) => {
        vi.setSystemTime(new Date('2024-05-15T12:00:00Z'));
        seedSubscription('target_tuesday', 'TUE');
        seedSubscription('non_target_wednesday', 'WED');

        const scheduledTime = Date.parse(scheduledTimeIso);
        await dailyDispatchCron.handleDispatch(mockEnv, scheduledTime);

        const stops = simulator.db.prepare('SELECT * FROM dispatch_stops ORDER BY subscription_id').all() as any[];
        const history = simulator.db.prepare('SELECT * FROM service_history ORDER BY subscription_id').all() as any[];

        expect(stops).toHaveLength(1);
        expect(stops[0]).toMatchObject({
            subscription_id: 'sub_target_tuesday',
            service_date: expectedServiceDate,
            driver_sales_rep_id: 'DRIVER',
            dispatch_status: 'assigned',
        });
        expect(stops[0].subscription_id).not.toBe('sub_non_target_wednesday');

        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({
            subscription_id: 'sub_target_tuesday',
            service_date: expectedServiceDate,
            dispatch_status: 'Pending',
        });
        expect(history[0].service_date).toBe(stops[0].service_date);
    });

    it('creates local dispatch stops and pending service history for tomorrow due subscriptions', async () => {
        seedSubscription('one', 'TUE');
        seedSubscription('two', 'WED');

        await dailyDispatchCron.handleDispatch(mockEnv);

        const stops = simulator.db.prepare('SELECT * FROM dispatch_stops').all() as any[];
        const history = simulator.db.prepare('SELECT * FROM service_history').all() as any[];

        expect(stops).toHaveLength(1);
        expect(stops[0]).toMatchObject({
            subscription_id: 'sub_one',
            service_date: '2024-05-14',
            driver_sales_rep_id: 'DRIVER',
            dispatch_status: 'assigned',
            bin_count: 2,
            customer_scent: 'lavender',
            service_notes: 'Gate code 1234',
        });
        expect(history).toHaveLength(1);
        expect(history[0].dispatch_status).toBe('Pending');
    });

    it('skips generation when dispatch setup is incomplete', async () => {
        simulator.db.prepare("DELETE FROM global_settings WHERE key = 'default_driver_sales_rep_id'").run();
        seedSubscription('missing_config', 'TUE');

        await dailyDispatchCron.handleDispatch(mockEnv);

        expect(simulator.db.prepare('SELECT * FROM dispatch_stops').all()).toHaveLength(0);
        expect(simulator.db.prepare('SELECT * FROM service_history').all()).toHaveLength(0);
    });

    it('applies holiday offset to the generated service date', async () => {
        simulator.db.prepare(
            "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('holiday_offset_hours', '24')"
        ).run();
        seedSubscription('holiday', 'TUE');

        await dailyDispatchCron.handleDispatch(mockEnv);

        const stop = simulator.db.prepare('SELECT * FROM dispatch_stops').get() as any;
        expect(stop.service_date).toBe('2024-05-15');
    });

    it('applies holiday shift as one local calendar day after the Eastern target date', async () => {
        vi.setSystemTime(new Date('2024-03-11T00:00:00Z'));
        simulator.db.prepare(
            "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('holiday_offset_hours', '24')"
        ).run();
        seedSubscription('dst_holiday', 'MON');

        await dailyDispatchCron.handleDispatch(mockEnv);

        const stop = simulator.db.prepare('SELECT * FROM dispatch_stops').get() as any;
        expect(stop.service_date).toBe('2024-03-12');
    });

    it('does not generate duplicate dispatch stops when pending history already exists', async () => {
        seedSubscription('duplicate', 'TUE');
        simulator.db.prepare(
            "INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES ('existing', 'sub_duplicate', '2024-05-14', 'Pending')"
        ).run();

        await dailyDispatchCron.handleDispatch(mockEnv);

        expect(simulator.db.prepare('SELECT * FROM dispatch_stops').all()).toHaveLength(0);
    });

    it('evaluates subscription due eligibility against the target service date', async () => {
        seedSubscriptionWithOptions('recurrence_due_on_target', {
            currentPeriodEnd: '2024-06-20T00:00:00.000Z',
        });
        simulator.db.prepare(
            "INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES ('completed_28_days_prior', 'sub_recurrence_due_on_target', '2024-04-16', 'Completed')"
        ).run();
        seedSubscriptionWithOptions('expires_before_target', {
            currentPeriodEnd: '2024-05-13T23:00:00.000Z',
        });
        seedSubscriptionWithOptions('expires_at_target_start', {
            currentPeriodEnd: '2024-05-14T00:00:00.000Z',
        });
        seedSubscriptionWithOptions('valid_on_target_day', {
            currentPeriodEnd: '2024-05-14T12:00:00.000Z',
        });

        await dailyDispatchCron.handleDispatch(mockEnv);

        const stops = simulator.db.prepare('SELECT * FROM dispatch_stops').all() as any[];
        expect(stops).toHaveLength(2);
        expect(stops.map((stop) => stop.subscription_id).sort()).toEqual([
            'sub_recurrence_due_on_target',
            'sub_valid_on_target_day',
        ]);
        expect(stops.every((stop) => stop.service_date === '2024-05-14')).toBe(true);
    });

    it('does nothing if no subscriptions are due for tomorrow', async () => {
        seedSubscription('not_tomorrow', 'WED');

        await dailyDispatchCron.handleDispatch(mockEnv);

        expect(simulator.db.prepare('SELECT * FROM dispatch_stops').all()).toHaveLength(0);
        expect(simulator.db.prepare('SELECT * FROM service_history').all()).toHaveLength(0);
    });

    it('dispatches cancelled subscriptions when current period end is in the future', async () => {
        seedSubscriptionWithOptions('future_cancelled', {
            status: 'cancelled',
            currentPeriodEnd: '2024-05-23T12:00:00.000Z',
        });

        await dailyDispatchCron.handleDispatch(mockEnv);

        const stop = simulator.db.prepare('SELECT * FROM dispatch_stops').get() as any;
        expect(stop.subscription_id).toBe('sub_future_cancelled');
    });

    it('does not dispatch cancelled subscriptions when current period end is in the past', async () => {
        seedSubscriptionWithOptions('past_cancelled', {
            status: 'cancelled',
            currentPeriodEnd: '2024-05-10T12:00:00.000Z',
        });

        await dailyDispatchCron.handleDispatch(mockEnv);

        expect(simulator.db.prepare('SELECT * FROM dispatch_stops').all()).toHaveLength(0);
    });

    it('geocodes missing coordinates and persists them before route generation', async () => {
        mockEnv.GEOAPIFY_API_KEY = 'geo_key';
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ features: [{ properties: { lat: 34.33, lon: -77.88 } }] }),
        } as any);
        seedSubscriptionWithOptions('missing_geo', { latitude: null, longitude: null });

        await dailyDispatchCron.handleDispatch(mockEnv);

        const stop = simulator.db.prepare('SELECT * FROM dispatch_stops').get() as any;
        const address = simulator.db.prepare("SELECT latitude, longitude FROM addresses WHERE id = 'addr_missing_geo'").get() as any;
        expect(stop.latitude).toBe(34.33);
        expect(stop.longitude).toBe(-77.88);
        expect(address.latitude).toBe(34.33);
        expect(address.longitude).toBe(-77.88);
        global.fetch = originalFetch;
    });

    it('keeps missing-coordinate stops route-visible when geocoding fails', async () => {
        mockEnv.GEOAPIFY_API_KEY = 'geo_key';
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({}),
        } as any);
        seedSubscriptionWithOptions('geo_fail', { latitude: null, longitude: null });

        await dailyDispatchCron.handleDispatch(mockEnv);

        const stop = simulator.db.prepare('SELECT * FROM dispatch_stops').get() as any;
        expect(stop.subscription_id).toBe('sub_geo_fail');
        expect(stop.latitude).toBeNull();
        expect(stop.longitude).toBeNull();
        global.fetch = originalFetch;
    });
});
