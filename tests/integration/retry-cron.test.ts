import { describe, it, expect, vi, beforeEach } from 'vitest';
import retryCron from '../../workers/retry-cron/index';
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

describe('Retry Cron Worker - Integration Tests with SQLite', () => {
    let simulator: DbSimulator;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();

        simulator = new DbSimulator();

        mockEnv = {
            DB: simulator,
            ROUTIFIC_API_KEY: 'test_key',
        };
    });

    it('should retry pending dispatches and remove them if successful', async () => {
        // Seed database
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust_retry1', 'retry1@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr_retry1', 'cust_retry1', '123 Retry St', 35.5, -80.5, 'MON', 'MON');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr_retry1', 'cust_retry1');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
        ).run('sub_retry1', 'cust_retry1', 'stripe_retry1', 'active', 28);
        simulator.db.prepare(
            'INSERT INTO pending_dispatches (id, customer_id, subscription_id, service_date, retry_count) VALUES (?, ?, ?, ?, ?)'
        ).run('pending1', 'cust_retry1', 'sub_retry1', '2026-05-19T00:00:00.000Z', 0);

        // Mock successful Routific call
        mockCreateJob.mockResolvedValueOnce('job_success');

        // Run retry cron
        await retryCron.handleRetries(mockEnv);

        // Verify Routific API was called
        expect(mockCreateJob).toHaveBeenCalledTimes(1);

        // Verify that the pending dispatch has been removed from DB
        const pending = simulator.db.prepare('SELECT * FROM pending_dispatches WHERE id = ?').get('pending1');
        expect(pending).toBeUndefined();

        // Verify that a Pending record has been created in service_history
        const history = simulator.db.prepare('SELECT * FROM service_history WHERE subscription_id = ?').all('sub_retry1') as any[];
        expect(history.length).toBe(1);
        expect(history[0].dispatch_status).toBe('Pending');
        expect(history[0].customer_id).toBe('cust_retry1');
        expect(history[0].service_date).toBe('2026-05-19T00:00:00.000Z');
    });

    it('should increment retry_count and set last_error if Routific call fails', async () => {
        // Seed database
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust_retry2', 'retry2@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr_retry2', 'cust_retry2', '456 Fail St', 35.6, -80.6, 'TUE', 'TUE');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr_retry2', 'cust_retry2');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
        ).run('sub_retry2', 'cust_retry2', 'stripe_retry2', 'active', 28);
        simulator.db.prepare(
            'INSERT INTO pending_dispatches (id, customer_id, subscription_id, service_date, retry_count) VALUES (?, ?, ?, ?, ?)'
        ).run('pending2', 'cust_retry2', 'sub_retry2', '2026-05-19T00:00:00.000Z', 1);

        // Mock Routific failure
        mockCreateJob.mockRejectedValueOnce(new Error('Routific error'));

        // Run retry cron
        await retryCron.handleRetries(mockEnv);

        // Verify Routific API was called
        expect(mockCreateJob).toHaveBeenCalledTimes(1);

        // Verify that the pending dispatch retry_count is incremented and error is saved
        const pending = simulator.db.prepare('SELECT * FROM pending_dispatches WHERE id = ?').get('pending2') as any;
        expect(pending).toBeDefined();
        expect(pending.retry_count).toBe(2);
        expect(pending.last_error).toBe('Routific error');
    });

    it('should ignore pending dispatches with retry_count >= 5', async () => {
        // Seed database
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run('cust_retry3', 'retry3@example.com');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('addr_retry3', 'cust_retry3', '789 Max St', 35.7, -80.7, 'WED', 'WED');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('addr_retry3', 'cust_retry3');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
        ).run('sub_retry3', 'cust_retry3', 'stripe_retry3', 'active', 28);
        simulator.db.prepare(
            'INSERT INTO pending_dispatches (id, customer_id, subscription_id, service_date, retry_count) VALUES (?, ?, ?, ?, ?)'
        ).run('pending3', 'cust_retry3', 'sub_retry3', '2026-05-19T00:00:00.000Z', 5);

        // Run retry cron
        await retryCron.handleRetries(mockEnv);

        // Verify Routific API was NOT called because retry_count is 5
        expect(mockCreateJob).not.toHaveBeenCalled();

        // Verify that the pending dispatch remains unchanged in DB
        const pending = simulator.db.prepare('SELECT * FROM pending_dispatches WHERE id = ?').get('pending3') as any;
        expect(pending).toBeDefined();
        expect(pending.retry_count).toBe(5);
    });
});
