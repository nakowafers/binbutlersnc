import { describe, it, expect, vi, beforeEach } from 'vitest';
import dispatchCron from '../../workers/dispatch-cron/index';

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

describe('Dispatch Cron Worker', () => {
    let mockDb: any;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockDb = {
            prepare: vi.fn().mockReturnThis(),
            bind: vi.fn().mockReturnThis(),
            all: vi.fn(),
            first: vi.fn(),
            batch: vi.fn().mockResolvedValue([]),
        };

        mockEnv = {
            DB: mockDb,
            ROUTIFIC_API_KEY: 'test_key',
        };
    });

    it('should push due subscriptions to Routific and not retry queue', async () => {
        // Mock DB returning 2 due subscriptions
        mockDb.all.mockResolvedValueOnce({
            results: [
                {
                    id: 'sub1',
                    customer_id: 'cust1',
                    status: 'active',
                    is_paused: 0,
                    frequency_days: 28,
                    raw_address: '123 Main St',
                    email: 'test1@example.com'
                },
                {
                    id: 'sub2',
                    customer_id: 'cust2',
                    status: 'one-time',
                    raw_address: '456 Oak St',
                    email: 'test2@example.com'
                }
            ]
        });

        // Mock DB returning 0 for holiday offset
        mockDb.first.mockResolvedValueOnce({ value: '0' });

        // Mock successful API call
        mockCreateJob.mockResolvedValueOnce('job_123');

        // Execute cron
        await dispatchCron.handleDispatch(mockEnv);

        // Verify DB query was executed
        expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
        
        // Verify Routific API was called with the correct data
        expect(mockCreateJob).toHaveBeenCalledTimes(1);
        const callArg = mockCreateJob.mock.calls[0][0];
        expect(callArg.stops.length).toBe(2);
        expect(callArg.stops[0].address).toBe('123 Main St');
        expect(callArg.stops[1].address).toBe('456 Oak St');

        // Verify pending_dispatches batch was NOT called since there was no error
        expect(mockDb.batch).not.toHaveBeenCalled();
    });

    it('should log to pending_dispatches if Routific API fails', async () => {
        // Mock DB returning 1 due subscription
        mockDb.all.mockResolvedValueOnce({
            results: [
                {
                    id: 'sub3',
                    customer_id: 'cust3',
                    status: 'active',
                    is_paused: 0,
                    frequency_days: 84,
                    raw_address: '789 Pine Rd',
                    email: 'test3@example.com'
                }
            ]
        });

        mockDb.first.mockResolvedValueOnce({ value: '0' });

        // Mock API failure
        mockCreateJob.mockRejectedValueOnce(new Error('Routific timeout'));

        // Execute cron
        await dispatchCron.handleDispatch(mockEnv);

        // Verify Routific API was called
        expect(mockCreateJob).toHaveBeenCalledTimes(1);

        // Verify pending_dispatches batch WAS called
        expect(mockDb.batch).toHaveBeenCalledTimes(1);
        
        const batchStatements = mockDb.batch.mock.calls[0][0];
        expect(batchStatements.length).toBe(1);
        
        // The prepare should be for the pending_dispatches table
        const prepareCalls = mockDb.prepare.mock.calls;
        const pendingPrepare = prepareCalls.find((call: string[]) => call[0].includes('INSERT INTO pending_dispatches'));
        expect(pendingPrepare).toBeDefined();
    });

    it('should do nothing if no subscriptions are due', async () => {
        // Mock DB returning 0 results
        mockDb.all.mockResolvedValueOnce({ results: [] });

        await dispatchCron.handleDispatch(mockEnv);

        // Verify Routific API was NOT called
        expect(mockCreateJob).not.toHaveBeenCalled();
        expect(mockDb.batch).not.toHaveBeenCalled();
    });
});
