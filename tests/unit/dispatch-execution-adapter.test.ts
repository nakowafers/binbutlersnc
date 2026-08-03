import { describe, expect, it, vi } from 'vitest';
import { DispatchExecutionAdapter } from '../../src/lib/dispatch/DispatchExecutionAdapter';
import { DueSubscriptionResult } from '../../src/lib/db/types';

function dueSubscription(overrides: Partial<DueSubscriptionResult> = {}): DueSubscriptionResult {
    return {
        id: 'sub_paused',
        customer_id: 'cust_paused',
        stripe_subscription_id: 'stripe_sub_paused',
        status: 'active',
        current_period_end: '2026-07-01T00:00:00.000Z',
        is_paused: false,
        frequency_days: 28,
        created_at: '2026-06-01T00:00:00.000Z',
        raw_address: '123 Pause St',
        latitude: 35.1,
        longitude: -80.1,
        service_day: 'TUE',
        email: 'paused@example.com',
        bin_quantity: 1,
        ...overrides,
    };
}

describe('DispatchExecutionAdapter', () => {
    it('queries due subscriptions for the target service date', async () => {
        const getDueSubscriptions = vi.fn().mockResolvedValue([dueSubscription({ id: 'sub_target_date', customer_id: 'cust_target_date' })]);
        const createDispatchRoute = vi.fn().mockResolvedValue(undefined);
        const adapter = new DispatchExecutionAdapter(
            {
                getDueSubscriptions,
                isSubscriptionPaused: vi.fn().mockResolvedValue(false),
            } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn().mockResolvedValue(null),
            } as any,
            {
                createDispatchRoute,
                getDispatchSetupStatus: vi.fn().mockResolvedValue({
                    isConfigured: true,
                    defaultDriverId: 'DRIVER',
                    depotLat: 34.2257,
                    depotLng: -77.9447,
                    missing: [],
                }),
                updateAddressCoordinates: vi.fn(),
            } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(getDueSubscriptions).toHaveBeenCalledWith('2024-05-14');
        expect(createDispatchRoute).toHaveBeenCalledOnce();
    });

    it('skips a due subscription if it becomes paused before routing execution', async () => {
        const logDispatchedJobs = vi.fn();
        const createDispatchStops = vi.fn();
        const adapter = new DispatchExecutionAdapter(
            {
                getDueSubscriptions: vi.fn().mockResolvedValue([dueSubscription()]),
                isSubscriptionPaused: vi.fn().mockResolvedValue(true),
            } as any,
            {
                logDispatchedJobs,
            } as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn().mockResolvedValue(null),
            } as any,
            {
                createDispatchStops,
                getDispatchSetupStatus: vi.fn(),
                updateAddressCoordinates: vi.fn(),
            } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(createDispatchStops).not.toHaveBeenCalled();
        expect(logDispatchedJobs).not.toHaveBeenCalled();
    });

    it('passes consumed first-service dates into route persistence', async () => {
        const createDispatchRoute = vi.fn().mockResolvedValue(undefined);
        const adapter = new DispatchExecutionAdapter(
            {
                getDueSubscriptions: vi.fn().mockResolvedValue([
                    dueSubscription({
                        id: 'sub_first_service',
                        customer_id: 'cust_first_service',
                        next_service_date: '2024-05-14',
                    }),
                ]),
                isSubscriptionPaused: vi.fn().mockResolvedValue(false),
            } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn().mockResolvedValue(null),
            } as any,
            {
                createDispatchRoute,
                getDispatchSetupStatus: vi.fn().mockResolvedValue({
                    isConfigured: true,
                    defaultDriverId: 'DRIVER',
                    depotLat: 34.2257,
                    depotLng: -77.9447,
                    missing: [],
                }),
                updateAddressCoordinates: vi.fn(),
            } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(createDispatchRoute).toHaveBeenCalledOnce();
        expect(createDispatchRoute).toHaveBeenCalledWith(expect.objectContaining({
            consumedFirstService: {
                subscriptionIds: ['sub_first_service'],
                serviceDate: '2024-05-14',
            },
        }));
    });

    it('does not persist consumed first-service dates separately when route persistence fails', async () => {
        const createDispatchRoute = vi.fn().mockRejectedValue(new Error('persist failed'));
        const adapter = new DispatchExecutionAdapter(
            {
                getDueSubscriptions: vi.fn().mockResolvedValue([
                    dueSubscription({
                        id: 'sub_first_service',
                        customer_id: 'cust_first_service',
                        next_service_date: '2024-05-14',
                    }),
                ]),
                isSubscriptionPaused: vi.fn().mockResolvedValue(false),
            } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn().mockResolvedValue(null),
            } as any,
            {
                createDispatchRoute,
                getDispatchSetupStatus: vi.fn().mockResolvedValue({
                    isConfigured: true,
                    defaultDriverId: 'DRIVER',
                    depotLat: 34.2257,
                    depotLng: -77.9447,
                    missing: [],
                }),
                updateAddressCoordinates: vi.fn(),
            } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(createDispatchRoute).toHaveBeenCalledWith(expect.objectContaining({
            consumedFirstService: {
                subscriptionIds: ['sub_first_service'],
                serviceDate: '2024-05-14',
            },
        }));
    });
});
