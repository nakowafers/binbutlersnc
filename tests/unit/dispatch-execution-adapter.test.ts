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
    it('keeps legacy eligibility when the Service Cycle cutover gate is closed', async () => {
        const getDueSubscriptions = vi.fn().mockResolvedValue([dueSubscription({ id: 'legacy_sub' })]);
        const getCycleEligibleSubscriptions = vi.fn();
        const adapter = new DispatchExecutionAdapter(
            { getDueSubscriptions, getCycleEligibleSubscriptions, isSubscriptionPaused: vi.fn().mockResolvedValue(false) } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn((key: string) => key === 'service_cycle_dispatch_cutover' ? null : null),
            } as any,
            { createDispatchRoute: vi.fn().mockResolvedValue(undefined), getDispatchSetupStatus: vi.fn().mockResolvedValue({ isConfigured: true, defaultDriverId: 'DRIVER', depotLat: 34, depotLng: -77, missing: [] }), updateAddressCoordinates: vi.fn() } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(getDueSubscriptions).toHaveBeenCalledWith('2024-05-14', '2024-05-14');
        expect(getCycleEligibleSubscriptions).not.toHaveBeenCalled();
    });

    it('uses due open Service Cycles as the enabled cutover authority', async () => {
        const getDueSubscriptions = vi.fn().mockResolvedValue([dueSubscription({ id: 'cycle_sub' })]);
        const getCycleEligibleSubscriptions = vi.fn().mockResolvedValue({ dueSubscriptions: [dueSubscription({
            id: 'cycle_sub', service_cycle_id: 'service-cycle:cycle_sub:2024-05-14', cycle_due_date: '2024-05-14',
        })], reviewSubscriptionIds: [] });
        const createDispatchRoute = vi.fn().mockResolvedValue(undefined);
        const adapter = new DispatchExecutionAdapter(
            { getDueSubscriptions, getCycleEligibleSubscriptions, isSubscriptionPaused: vi.fn().mockResolvedValue(false) } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn((key: string) => key === 'service_cycle_dispatch_cutover'
                    ? JSON.stringify({ enabled: true, parityVerified: true, recoveryAuditVerified: true, billingDriftAuditVerified: true }) : null),
            } as any,
            { createDispatchRoute, getDispatchSetupStatus: vi.fn().mockResolvedValue({ isConfigured: true, defaultDriverId: 'DRIVER', depotLat: 34, depotLng: -77, missing: [] }), updateAddressCoordinates: vi.fn() } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(getCycleEligibleSubscriptions).toHaveBeenCalledWith('2024-05-14', '2024-05-14');
        expect(getDueSubscriptions).toHaveBeenCalledWith('2024-05-14', '2024-05-14');
        expect(createDispatchRoute).toHaveBeenCalledWith(expect.objectContaining({
            cycles: [],
            history: [expect.objectContaining({ serviceCycleId: 'service-cycle:cycle_sub:2024-05-14' })],
            stops: [expect.objectContaining({ serviceCycleId: 'service-cycle:cycle_sub:2024-05-14' })],
        }));
    });

    it('keeps open Service Cycles authoritative and emits a PII-free parity alert when selections mismatch', async () => {
        const createDispatchRoute = vi.fn().mockResolvedValue(undefined);
        const getDueSubscriptions = vi.fn().mockResolvedValue([dueSubscription({ id: 'legacy_sub' }), dueSubscription({ id: 'review_sub' })]);
        const getCycleEligibleSubscriptions = vi.fn().mockResolvedValue({ dueSubscriptions: [dueSubscription({ id: 'cycle_sub' })], reviewSubscriptionIds: ['review_sub'] });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const adapter = new DispatchExecutionAdapter(
            { getDueSubscriptions, getCycleEligibleSubscriptions, isSubscriptionPaused: vi.fn().mockResolvedValue(false) } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn((key: string) => key === 'service_cycle_dispatch_cutover'
                    ? JSON.stringify({ enabled: true, parityVerified: true, recoveryAuditVerified: true, billingDriftAuditVerified: true }) : null),
            } as any,
            { createDispatchRoute, getDispatchSetupStatus: vi.fn().mockResolvedValue({ isConfigured: true, defaultDriverId: 'DRIVER', depotLat: 34, depotLng: -77, missing: [] }), updateAddressCoordinates: vi.fn() } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"legacyOnlySubscriptionIds":["legacy_sub","review_sub"]'));
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"reviewSubscriptionIds":["review_sub"]'));
        expect(getCycleEligibleSubscriptions).toHaveBeenCalledOnce();
        expect(createDispatchRoute).toHaveBeenCalledWith(expect.objectContaining({
            stops: [expect.objectContaining({ subscriptionId: 'cycle_sub' })],
        }));
        warn.mockRestore();
    });

    it('reports persisted recovery-review suppressions with only opaque subscription IDs and reasons', async () => {
        const createDispatchRoute = vi.fn().mockResolvedValue(undefined);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const adapter = new DispatchExecutionAdapter(
            {
                getDueSubscriptions: vi.fn().mockResolvedValue([dueSubscription({ id: 'reviewed_sub' })]),
                getCycleEligibleSubscriptions: vi.fn().mockResolvedValue({
                    dueSubscriptions: [],
                    reviewSubscriptionIds: ['reviewed_sub'],
                    recoveryReviewSuppressions: [{ subscriptionId: 'reviewed_sub', reason: 'missing_anchor' }],
                }),
                isSubscriptionPaused: vi.fn().mockResolvedValue(false),
            } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn((key: string) => key === 'service_cycle_dispatch_cutover'
                    ? JSON.stringify({ enabled: true, parityVerified: true, recoveryAuditVerified: true, billingDriftAuditVerified: true }) : null),
            } as any,
            { createDispatchRoute, getDispatchSetupStatus: vi.fn(), updateAddressCoordinates: vi.fn() } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(createDispatchRoute).not.toHaveBeenCalled();
        const operationalOutput = warn.mock.calls.map(([message]) => String(message)).join('\n');
        expect(operationalOutput).toContain('"subscriptionId":"reviewed_sub"');
        expect(operationalOutput).toContain('"reason":"missing_anchor"');
        expect(operationalOutput).not.toMatch(/example\.com|123 Pause St|stripe_sub/i);
        warn.mockRestore();
    });

    it('rolls back to legacy eligibility when the gate is turned off without changing cycle evidence', async () => {
        const getDueSubscriptions = vi.fn().mockResolvedValue([dueSubscription({ id: 'sub_rollback' })]);
        const getCycleEligibleSubscriptions = vi.fn().mockResolvedValue({ dueSubscriptions: [dueSubscription({ id: 'sub_rollback' })], reviewSubscriptionIds: [] });
        const settings = { service_cycle_dispatch_cutover: JSON.stringify({ enabled: true, parityVerified: true, recoveryAuditVerified: true, billingDriftAuditVerified: true }) } as Record<string, string | null>;
        const adapter = new DispatchExecutionAdapter(
            { getDueSubscriptions, getCycleEligibleSubscriptions, isSubscriptionPaused: vi.fn().mockResolvedValue(false) } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn((key: string) => settings[key] ?? null),
            } as any,
            { createDispatchRoute: vi.fn().mockResolvedValue(undefined), getDispatchSetupStatus: vi.fn().mockResolvedValue({ isConfigured: true, defaultDriverId: 'DRIVER', depotLat: 34, depotLng: -77, missing: [] }), updateAddressCoordinates: vi.fn() } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));
        settings.service_cycle_dispatch_cutover = null;
        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(getCycleEligibleSubscriptions).toHaveBeenCalledTimes(1);
        expect(getDueSubscriptions).toHaveBeenCalledTimes(2);
    });

    it('evaluates eligibility on the unshifted cycle date and assigns the target service date', async () => {
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

        expect(getDueSubscriptions).toHaveBeenCalledWith('2024-05-14', '2024-05-14');
        expect(createDispatchRoute).toHaveBeenCalledOnce();
    });

    it('keeps the cycle due date stable when a holiday shifts only the attempt service date', async () => {
        const createDispatchRoute = vi.fn().mockResolvedValue(undefined);
        const adapter = new DispatchExecutionAdapter(
            {
                getDueSubscriptions: vi.fn().mockResolvedValue([dueSubscription({ id: 'sub_holiday' })]),
                isSubscriptionPaused: vi.fn().mockResolvedValue(false),
            } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn().mockResolvedValue('24'),
            } as any,
            {
                createDispatchRoute,
                getDispatchSetupStatus: vi.fn().mockResolvedValue({
                    isConfigured: true, defaultDriverId: 'DRIVER', depotLat: 34.2257, depotLng: -77.9447, missing: [],
                }),
                updateAddressCoordinates: vi.fn(),
            } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(createDispatchRoute).toHaveBeenCalledWith(expect.objectContaining({
            cycles: [expect.objectContaining({ cycleDueDate: '2024-05-14' })],
            history: [expect.objectContaining({ date: '2024-05-15', cycleDueDate: '2024-05-14' })],
            stops: [expect.objectContaining({ serviceDate: '2024-05-15', cycleDueDate: '2024-05-14' })],
        }));
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

    it('requests the same idempotent vacation exception without creating an attempt or automatic catch-up', async () => {
        const recordCycleException = vi.fn().mockResolvedValue(undefined);
        const getDispatchSetupStatus = vi.fn();
        const adapter = new DispatchExecutionAdapter(
            {
                getDueSubscriptions: vi.fn().mockResolvedValue([dueSubscription({ id: 'sub_vacation' })]),
                isSubscriptionPaused: vi.fn().mockResolvedValue(true),
                recordCycleException,
            } as any,
            {} as any,
            {
                acquireLock: vi.fn().mockResolvedValue(true),
                getGlobalSetting: vi.fn().mockResolvedValue(null),
            } as any,
            { createDispatchRoute: vi.fn(), getDispatchSetupStatus, updateAddressCoordinates: vi.fn() } as any
        );

        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));
        await adapter.dispatchDueStops(new Date('2024-05-13T12:00:00Z'));

        expect(recordCycleException).toHaveBeenCalledTimes(2);
        expect(recordCycleException).toHaveBeenLastCalledWith(expect.objectContaining({
            subscriptionId: 'sub_vacation', cycleDueDate: '2024-05-14', reason: 'vacation_pause',
        }));
        expect(getDispatchSetupStatus).not.toHaveBeenCalled();
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
