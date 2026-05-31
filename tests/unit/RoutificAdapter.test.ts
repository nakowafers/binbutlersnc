import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';
import { RoutingJob } from '../../src/lib/routing/types';

describe('RoutificAdapter', () => {
    let adapter: RoutificAdapter;

    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('should throw an error if API key is missing or invalid', async () => {
        adapter = new RoutificAdapter('');
        await expect(adapter.createJob({ id: '1', date: '2026-05-20', stops: [] })).rejects.toThrow("Missing or invalid Routific API Key. Please check your .dev.vars file.");
        
        adapter = new RoutificAdapter('your_routific_api_key_here');
        await expect(adapter.createJob({ id: '1', date: '2026-05-20', stops: [] })).rejects.toThrow("Missing or invalid Routific API Key.");
    });

    it('should throw an error if workspace ID is missing', async () => {
        adapter = new RoutificAdapter('valid_api_key');
        await expect(adapter.createJob({ id: '1', date: '2026-05-20', stops: [] })).rejects.toThrow("Missing Routific Workspace ID. This is required for the Platform API.");
    });

    it('should successfully post orders and return a sync confirmation', async () => {
        adapter = new RoutificAdapter('valid_api_key', 'workspace_123');
        
        const mockResponse = { ok: true, text: vi.fn().mockResolvedValue('success') };
        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        const job: RoutingJob = {
            id: 'job_1',
            date: '2026-05-20',
            stops: [
                {
                    id: 'stop_1',
                    address: '123 Fake St',
                    lat: 45.0,
                    lng: -75.0,
                    customer_id: 'cust_abc',
                    subscription_id: 'sub_xyz'
                }
            ]
        };

        const result = await adapter.createJob(job);

        expect(result).toBe('synced-2026-05-20');
        expect(fetch).toHaveBeenCalledTimes(1);
        
        const fetchArgs = vi.mocked(fetch).mock.calls[0];
        expect(fetchArgs[0]).toBe('https://planning-service.beta.routific.com/v1/orders?workspaceId=workspace_123');
        
        const options = fetchArgs[1];
        expect(options?.method).toBe('POST');
        expect(options?.headers).toEqual({
            'Authorization': 'Bearer valid_api_key',
            'Content-Type': 'application/json',
        });

        const body = JSON.parse(options?.body as string);
        expect(body).toEqual([
            {
                name: 'Bin: cust_abc',
                locations: [{ address: '123 Fake St', lat: 45.0, lng: -75.0 }],
                instructions: 'Sub: sub_xyz | Cust: cust_abc',
                deliveryDate: '2026-05-20',
                customerOrderNumber: 'stop_1'
            }
        ]);
    });

    it('should throw an error if the fetch response is not ok', async () => {
        adapter = new RoutificAdapter('valid_api_key', 'workspace_123');
        
        const mockResponse = { ok: false, text: vi.fn().mockResolvedValue('Invalid payload') };
        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        const job: RoutingJob = { id: 'job_1', date: '2026-05-20', stops: [] };

        await expect(adapter.createJob(job)).rejects.toThrow('Routific Orders API error: Invalid payload');
    });

    it('should return synced for getJobStatus', async () => {
        adapter = new RoutificAdapter('valid_api_key', 'workspace_123');
        const status = await adapter.getJobStatus('some_id');
        expect(status).toBe('synced');
    });

    it('should pushTarget, updateTarget, and getDispatchStatus', async () => {
        adapter = new RoutificAdapter('valid_api_key', 'workspace_123');
        
        // Mock getDispatchStatus
        const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ status: 'completed' }) };
        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        const status = await adapter.getDispatchStatus('order_123');
        expect(status).toBe('completed');
        expect(fetch).toHaveBeenCalledWith(
            'https://planning-service.beta.routific.com/v1/orders/order_123?workspaceId=workspace_123',
            expect.objectContaining({ method: 'GET' })
        );

        // Mock updateTarget
        const mockUpdateResponse = { ok: true };
        vi.mocked(fetch).mockResolvedValue(mockUpdateResponse as unknown as Response);

        await adapter.updateTarget({
            id: 'order_123',
            address: '123 Fake St',
            lat: 45.0,
            lng: -75.0,
            customer_id: 'cust_abc',
            subscription_id: 'sub_xyz'
        });
        expect(fetch).toHaveBeenLastCalledWith(
            'https://planning-service.beta.routific.com/v1/orders/order_123?workspaceId=workspace_123',
            expect.objectContaining({ method: 'PUT' })
        );

        // Mock pushTarget
        const mockPushResponse = { ok: true, text: vi.fn().mockResolvedValue('success') };
        vi.mocked(fetch).mockResolvedValue(mockPushResponse as unknown as Response);

        const pushResult = await adapter.pushTarget({
            id: 'order_123',
            address: '123 Fake St',
            lat: 45.0,
            lng: -75.0,
            customer_id: 'cust_abc',
            subscription_id: 'sub_xyz'
        });
        expect(pushResult).toContain('synced');
    });
});
