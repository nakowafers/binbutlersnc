import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dispatchCron from '../../workers/dispatch-cron/index';
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

describe('Dispatch Cron Worker - Integration Tests with SQLite', () => {
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

    it('should push due subscriptions to Routific grouped by service_day and insert Pending history', async () => {
        // Seed database
        // Customer 1 - Monday service
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust1', 'test1@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr1', 'cust1', '123 Main St', 35.1, -80.1, 'MON', 'MON');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr1', 'cust1');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub1', 'cust1', 'stripe_sub1', 'active', '2026-06-20T00:00:00.000Z', 28);

        // Customer 2 - Tuesday service (one-time)
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust2', 'test2@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr2', 'cust2', '456 Oak St', 35.2, -80.2, 'TUE', 'TUE');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr2', 'cust2');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
        ).run('sub2', 'cust2', 'stripe_sub2', 'one-time', 0);

        // Mock successful API calls
        mockCreateJob.mockResolvedValue('job_123');

        // Execute cron
        await dispatchCron.handleDispatch(mockEnv);

        // Verify Routific API was called twice (once for 2024-05-14 (TUE) and once for 2024-05-20 (MON))
        expect(mockCreateJob).toHaveBeenCalledTimes(2);
        
        // Check Monday Job (2024-05-20)
        const monJobCall = mockCreateJob.mock.calls.find(call => call[0].date === '2024-05-20');
        expect(monJobCall).toBeDefined();
        expect(monJobCall[0].stops.length).toBe(1);
        expect(monJobCall[0].stops[0].address).toBe('123 Main St');

        // Check Tuesday Job (2024-05-14)
        const tueJobCall = mockCreateJob.mock.calls.find(call => call[0].date === '2024-05-14');
        expect(tueJobCall).toBeDefined();
        expect(tueJobCall[0].stops.length).toBe(1);
        expect(tueJobCall[0].stops[0].address).toBe('456 Oak St');

        // Verify service_history table has 2 'Pending' rows
        const history = simulator.db.prepare('SELECT * FROM service_history').all() as any[];
        expect(history.length).toBe(2);
        expect(history.every(h => h.dispatch_status === 'Pending')).toBe(true);
        
        const sub1History = history.find(h => h.subscription_id === 'sub1');
        expect(sub1History.service_date).toBe('2024-05-20');

        const sub2History = history.find(h => h.subscription_id === 'sub2');
        expect(sub2History.service_date).toBe('2024-05-14');
    });

    it('should log to pending_dispatches if Routific API fails', async () => {
        // Seed database
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust3', 'test3@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr3', 'cust3', '789 Pine Rd', 35.3, -80.3, 'WED', 'WED');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr3', 'cust3');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub3', 'cust3', 'stripe_sub3', 'active', '2026-06-20T00:00:00.000Z', 84);

        // Mock API failure
        mockCreateJob.mockRejectedValue(new Error('Routific timeout'));

        // Execute cron
        await dispatchCron.handleDispatch(mockEnv);

        // Verify Routific API was called
        expect(mockCreateJob).toHaveBeenCalledTimes(1);

        // Verify pending_dispatches has 1 row
        const pending = simulator.db.prepare('SELECT * FROM pending_dispatches').all() as any[];
        expect(pending.length).toBe(1);
        expect(pending[0].customer_id).toBe('cust3');
        expect(pending[0].subscription_id).toBe('sub3');
        expect(pending[0].last_error).toBe('Routific timeout');
        
        // Verify service_history is still empty
        const history = simulator.db.prepare('SELECT * FROM service_history').all();
        expect(history.length).toBe(0);
    });

    it('should do nothing if no subscriptions are due', async () => {
        // Customer 4 - not due yet because last_service_date is today and frequency is 28 days
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
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days, last_service_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('sub4', 'cust4', 'stripe_sub4', 'active', '2026-06-20T00:00:00.000Z', 28, '2024-05-13T12:00:00Z');

        await dispatchCron.handleDispatch(mockEnv);

        // Verify Routific API was NOT called
        expect(mockCreateJob).not.toHaveBeenCalled();

        // Verify pending_dispatches table is empty
        const pending = simulator.db.prepare('SELECT * FROM pending_dispatches').all();
        expect(pending.length).toBe(0);
    });

    it('should dispatch cancelled subscriptions if current_period_end is in the future', async () => {
        // Customer 5 - cancelled but period ends in future
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust5', 'test5@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr5', 'cust5', '101 Future St', 35.5, -80.5, 'FRI', 'FRI');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr5', 'cust5');
        
        const futureDate = new Date('2024-05-23T12:00:00Z');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub5', 'cust5', 'stripe_sub5', 'cancelled', futureDate.toISOString(), 28);

        mockCreateJob.mockResolvedValue('job_456');

        await dispatchCron.handleDispatch(mockEnv);

        expect(mockCreateJob).toHaveBeenCalledTimes(1);
        const callArg = mockCreateJob.mock.calls[0][0];
        expect(callArg.stops.length).toBe(1);
        expect(callArg.stops[0].subscription_id).toBe('sub5');
        expect(callArg.date).toBe('2024-05-17'); // Next FRI after May 13 (Mon)
    });

    it('should not dispatch cancelled subscriptions if current_period_end is in the past', async () => {
        // Customer 6 - cancelled and period ended
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust6', 'test6@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr6', 'cust6', '202 Past St', 35.6, -80.6, 'MON', 'MON');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr6', 'cust6');
        
        const pastDate = new Date('2024-05-10T12:00:00Z');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub6', 'cust6', 'stripe_sub6', 'cancelled', pastDate.toISOString(), 28);

        await dispatchCron.handleDispatch(mockEnv);

        expect(mockCreateJob).not.toHaveBeenCalled();
    });

    it('should apply holiday offsets to the dispatch date after calculating next service day', async () => {
        // Customer 7 - Monday service
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust7', 'test7@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr7', 'cust7', '303 Holiday St', 35.7, -80.7, 'MON', 'MON');
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

        await dispatchCron.handleDispatch(mockEnv);

        expect(mockCreateJob).toHaveBeenCalledTimes(1);
        const callArg = mockCreateJob.mock.calls[0][0];
        
        // Today is MON. Next MON is +7 days = 2024-05-20.
        // Offset +24 hours -> 2024-05-21.
        expect(callArg.date).toBe('2024-05-21');
    });

    it('should NOT dispatch if there is already a Pending service record', async () => {
         // Customer 8
         simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust8', 'test8@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr8', 'cust8', '888 Busy St', 35.8, -80.8, 'MON', 'MON');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr8', 'cust8');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, current_period_end, frequency_days) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('sub8', 'cust8', 'stripe_sub8', 'active', '2026-06-20T00:00:00.000Z', 28);

        // Add a Pending record manually
        simulator.db.prepare(
            'INSERT INTO service_history (id, customer_id, subscription_id, service_date, dispatch_status) VALUES (?, ?, ?, ?, ?)'
        ).run('sh_busy', 'cust8', 'sub8', '2024-05-20', 'Pending');

        await dispatchCron.handleDispatch(mockEnv);

        // Should NOT call Routific
        expect(mockCreateJob).not.toHaveBeenCalled();
    });
});
