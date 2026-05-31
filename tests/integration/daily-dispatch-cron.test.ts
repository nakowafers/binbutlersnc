import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dailyDispatchCron from '../../workers/daily-dispatch-cron/index';
import { DbSimulator } from './db-simulator';

// Mock Routific Adapter
const mockCreateJob = vi.fn();
vi.mock('../../src/lib/routing/RoutificAdapter', () => {
    return {
        RoutificAdapter: class {
            constructor() {}
            createJob = mockCreateJob;
        }
    };
});

describe('Daily Dispatch Cron Worker - Integration Tests with SQLite', () => {
    let simulator: DbSimulator;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();
        // Set system time to a fixed Monday: 2024-05-13
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-05-13T12:00:00Z'));

        simulator = new DbSimulator();

        mockEnv = {
            DB: simulator,
            ROUTIFIC_API_KEY: 'test_key',
            ROUTIFIC_WORKSPACE_ID: 'test_ws_id',
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should push only tomorrow\'s due subscriptions to Routific and insert Pending history', async () => {
        // Seed database
        // Customer 1 - Tuesday service (tomorrow)
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust1', 'test1@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr1', 'cust1', '123 Main St', 35.1, -80.1, 'TUE', 'TUE');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr1', 'cust1');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub1', 'cust1', 'stripe_sub1', 'active', '2026-06-20T00:00:00.000Z', 28);

        // Customer 2 - Wednesday service (2 days away - should be skipped)
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust2', 'test2@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr2', 'cust2', '456 Oak St', 35.2, -80.2, 'WED', 'WED');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr2', 'cust2');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
        ).run('sub2', 'cust2', 'stripe_sub2', 'one-time', 0);

        // Mock successful API calls
        mockCreateJob.mockResolvedValue('job_123');

        // Execute cron
        await dailyDispatchCron.handleDispatch(mockEnv);

        // Verify Routific API was called once (only Tuesday stops)
        expect(mockCreateJob).toHaveBeenCalledTimes(1);

        // Check the job is for 2024-05-14 (Tuesday)
        const callArg = mockCreateJob.mock.calls[0][0];
        expect(callArg.date).toBe('2024-05-14');
        expect(callArg.stops.length).toBe(1);
        expect(callArg.stops[0].address).toBe('123 Main St');

        // Verify service_history table has 1 'Pending' row
        const history = simulator.db.prepare('SELECT * FROM service_history').all() as any[];
        expect(history.length).toBe(1);
        expect(history[0].dispatch_status).toBe('Pending');
        expect(history[0].subscription_id).toBe('sub1');
        expect(history[0].service_date).toBe('2024-05-14');
    });

    it('should log to pending_dispatches if Routific API fails', async () => {
        // Seed database: customer with Tuesday service (tomorrow)
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust3', 'test3@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr3', 'cust3', '789 Pine Rd', 35.3, -80.3, 'TUE', 'TUE');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr3', 'cust3');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub3', 'cust3', 'stripe_sub3', 'active', '2026-06-20T00:00:00.000Z', 84);

        // Mock API failure
        mockCreateJob.mockRejectedValue(new Error('Routific timeout'));

        // Execute cron
        await dailyDispatchCron.handleDispatch(mockEnv);

        // Verify Routific API was called
        expect(mockCreateJob).toHaveBeenCalledTimes(1);

        // Verify pending_dispatches has 1 row
        const pending = simulator.db.prepare('SELECT * FROM pending_dispatches').all() as any[];
        expect(pending.length).toBe(1);
        expect(pending[0].subscription_id).toBe('sub3');
        expect(pending[0].last_error).toBe('Routific timeout');

        // Verify service_history is still empty
        const history = simulator.db.prepare('SELECT * FROM service_history').all();
        expect(history.length).toBe(0);
    });

    it('should do nothing if no subscriptions are due', async () => {
        // Customer 4 - not due yet because they have a Completed service_history record today and frequency is 28 days
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust4', 'test4@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr4', 'cust4', '999 Past St', 35.4, -80.4, 'THU', 'THU');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr4', 'cust4');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub4', 'cust4', 'stripe_sub4', 'active', '2026-06-20T00:00:00.000Z', 28);
        simulator.db.prepare(
            'INSERT INTO service_history (id, subscription_id, dispatch_status, service_date) VALUES (?, ?, ?, ?)'
        ).run('sh_recent', 'sub4', 'Completed', '2024-05-13T12:00:00Z');

        await dailyDispatchCron.handleDispatch(mockEnv);

        // Verify Routific API was NOT called
        expect(mockCreateJob).not.toHaveBeenCalled();

        // Verify pending_dispatches table is empty
        const pending = simulator.db.prepare('SELECT * FROM pending_dispatches').all();
        expect(pending.length).toBe(0);
    });

    it('should dispatch cancelled subscriptions if current_period_end is in the future', async () => {
        // Customer 5 - cancelled but period ends in future, Tuesday service (tomorrow)
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust5', 'test5@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr5', 'cust5', '101 Future St', 35.5, -80.5, 'TUE', 'TUE');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr5', 'cust5');

        const futureDate = new Date('2024-05-23T12:00:00Z');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub5', 'cust5', 'stripe_sub5', 'cancelled', futureDate.toISOString(), 28);

        mockCreateJob.mockResolvedValue('job_456');

        await dailyDispatchCron.handleDispatch(mockEnv);

        expect(mockCreateJob).toHaveBeenCalledTimes(1);
        const callArg = mockCreateJob.mock.calls[0][0];
        expect(callArg.stops.length).toBe(1);
        expect(callArg.stops[0].subscription_id).toBe('sub5');
        expect(callArg.date).toBe('2024-05-14');
    });

    it('should not dispatch cancelled subscriptions if current_period_end is in the past', async () => {
        // Customer 6 - cancelled and period ended, Tuesday service (tomorrow but filtered by db query)
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust6', 'test6@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr6', 'cust6', '202 Past St', 35.6, -80.6, 'TUE', 'TUE');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr6', 'cust6');

        const pastDate = new Date('2024-05-10T12:00:00Z');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub6', 'cust6', 'stripe_sub6', 'cancelled', pastDate.toISOString(), 28);

        await dailyDispatchCron.handleDispatch(mockEnv);

        expect(mockCreateJob).not.toHaveBeenCalled();
    });

    it('should apply holiday offsets to the dispatch date', async () => {
        // Customer 7 - Tuesday service (tomorrow)
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust7', 'test7@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr7', 'cust7', '303 Holiday St', 35.7, -80.7, 'TUE', 'TUE');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr7', 'cust7');

        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub7', 'cust7', 'stripe_sub7', 'active', '2026-06-20T00:00:00.000Z', 28);

        // Set holiday offset to 24 hours (1 day)
        simulator.db.prepare(
            "INSERT OR REPLACE INTO global_settings (key, value) VALUES ('holiday_offset_hours', '24')"
        ).run();

        mockCreateJob.mockResolvedValue('job_789');

        await dailyDispatchCron.handleDispatch(mockEnv);

        expect(mockCreateJob).toHaveBeenCalledTimes(1);
        const callArg = mockCreateJob.mock.calls[0][0];

        // Today is MON. Tomorrow is TUE (2024-05-14). Offset +24 hours -> 2024-05-15.
        expect(callArg.date).toBe('2024-05-15');
    });

    it('should NOT dispatch if there is already a Pending service record', async () => {
        // Customer 8 - Tuesday service (tomorrow)
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust8', 'test8@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr8', 'cust8', '888 Busy St', 35.8, -80.8, 'TUE', 'TUE');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr8', 'cust8');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub8', 'cust8', 'stripe_sub8', 'active', '2026-06-20T00:00:00.000Z', 28);

        // Add a Pending record manually
        simulator.db.prepare(
            'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES (?, ?, ?, ?)'
        ).run('sh_busy', 'sub8', '2024-05-14', 'Pending');

        await dailyDispatchCron.handleDispatch(mockEnv);

        // Should NOT call Routific
        expect(mockCreateJob).not.toHaveBeenCalled();
    });
});
