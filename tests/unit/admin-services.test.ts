import { describe, expect, it, vi } from 'vitest';
import { AdminCustomerService, AdminServiceError } from '../../src/lib/admin/AdminCustomerService';
import { AdminSettingsError, AdminSettingsService } from '../../src/lib/admin/AdminSettingsService';

describe('AdminSettingsService', () => {
    it('rejects unsupported setting keys', async () => {
        const repo = { setGlobalSetting: vi.fn() };
        const service = new AdminSettingsService(repo as any);

        await expect(service.updateSetting('unsupported', '1'))
            .rejects.toEqual(new AdminSettingsError(400, 'Invalid setting key'));
        expect(repo.setGlobalSetting).not.toHaveBeenCalled();
    });

    it('persists allowed setting keys', async () => {
        const repo = { setGlobalSetting: vi.fn().mockResolvedValue(undefined) };
        const service = new AdminSettingsService(repo as any);

        await service.updateSetting('holiday_offset_hours', '24');

        expect(repo.setGlobalSetting).toHaveBeenCalledWith('holiday_offset_hours', '24');
    });
});

describe('AdminCustomerService manual first-service reschedule', () => {
    function createRepo(overrides: Record<string, unknown> = {}) {
        return {
            updateCustomer: vi.fn(),
            updateAddress: vi.fn(),
            getStripeCustomerId: vi.fn().mockResolvedValue(null),
            getCustomerById: vi.fn(),
            getAddressById: vi.fn().mockResolvedValue({ id: 'addr_1', service_day: 'WED' }),
            getAllCustomersWithDetails: vi.fn().mockResolvedValue([]),
            updateAddressNotes: vi.fn(),
            deleteCustomerCascade: vi.fn(),
            getSubscriptionByCustomerId: vi.fn().mockResolvedValue({
                id: 'sub_1',
                customer_id: 'cust_1',
                status: 'active',
                frequency_days: 28,
                is_paused: false,
                next_service_date: null,
                created_at: '2026-07-01T00:00:00.000Z',
            }),
            getFirstServiceAttemptSummary: vi.fn().mockResolvedValue({
                completedCount: 0,
                skippedCount: 1,
            }),
            updateSubscriptionFirstServiceDate: vi.fn().mockResolvedValue(undefined),
            ...overrides,
        };
    }

    const paymentService = { updateCustomerServiceDetails: vi.fn() };

    it('sets a new First Service Date for a skipped recurring first-service attempt', async () => {
        const repo = createRepo();
        const service = new AdminCustomerService(repo as any, paymentService as any, false);

        await service.updateCustomer({
            customerId: 'cust_1',
            addressId: 'addr_1',
            manualRescheduleFirstServiceDate: '2026-07-29',
            serviceDay: 'WED',
        });

        expect(repo.updateSubscriptionFirstServiceDate).toHaveBeenCalledWith('sub_1', '2026-07-29');
    });

    it('does not require Stripe metadata sync for a manual-only reschedule', async () => {
        const repo = createRepo({
            getStripeCustomerId: vi.fn().mockResolvedValue('cus_1'),
        });
        const localPaymentService = { updateCustomerServiceDetails: vi.fn() };
        const service = new AdminCustomerService(repo as any, localPaymentService as any, false);

        await service.updateCustomer({
            customerId: 'cust_1',
            addressId: 'addr_1',
            manualRescheduleFirstServiceDate: '2026-07-29',
            serviceDay: 'WED',
        });

        expect(repo.updateSubscriptionFirstServiceDate).toHaveBeenCalledWith('sub_1', '2026-07-29');
        expect(localPaymentService.updateCustomerServiceDetails).not.toHaveBeenCalled();
    });


    it('rejects recurring reschedules that do not match the Service Day without changing the Subscription', async () => {
        const repo = createRepo();
        const service = new AdminCustomerService(repo as any, paymentService as any, false);

        await expect(service.updateCustomer({
            customerId: 'cust_1',
            addressId: 'addr_1',
            manualRescheduleFirstServiceDate: '2026-07-30',
            serviceDay: 'WED',
        })).rejects.toEqual(new AdminServiceError(400, 'First Service Date must be a Wednesday'));

        expect(repo.updateSubscriptionFirstServiceDate).not.toHaveBeenCalled();
    });

    it('validates against persisted Service Day instead of caller-supplied Service Day', async () => {
        const repo = createRepo({
            getAddressById: vi.fn().mockResolvedValue({ id: 'addr_1', service_day: 'THU' }),
        });
        const service = new AdminCustomerService(repo as any, paymentService as any, false);

        await expect(service.updateCustomer({
            customerId: 'cust_1',
            addressId: 'addr_1',
            manualRescheduleFirstServiceDate: '2026-07-29',
            serviceDay: 'WED',
        })).rejects.toEqual(new AdminServiceError(400, 'First Service Date must be a Thursday'));

        expect(repo.updateSubscriptionFirstServiceDate).not.toHaveBeenCalled();
    });

    it('rejects one-time reschedules on weekends without changing the Subscription', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-24T12:00:00Z'));

        const repo = createRepo({
            getSubscriptionByCustomerId: vi.fn().mockResolvedValue({
                id: 'sub_1',
                customer_id: 'cust_1',
                status: 'one-time',
                frequency_days: 0,
                is_paused: false,
                next_service_date: null,
                created_at: '2026-07-01T00:00:00.000Z',
            }),
        });
        const service = new AdminCustomerService(repo as any, paymentService as any, false);

        try {
            await expect(service.updateCustomer({
                customerId: 'cust_1',
                addressId: 'addr_1',
                manualRescheduleFirstServiceDate: '2026-07-25',
                serviceDay: 'WED',
            })).rejects.toEqual(new AdminServiceError(400, 'First Service Date must be a weekday'));

            expect(repo.updateSubscriptionFirstServiceDate).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('rejects customers that already completed first service without changing the Subscription', async () => {
        const repo = createRepo({
            getFirstServiceAttemptSummary: vi.fn().mockResolvedValue({
                completedCount: 1,
                skippedCount: 0,
            }),
        });
        const service = new AdminCustomerService(repo as any, paymentService as any, false);

        await expect(service.updateCustomer({
            customerId: 'cust_1',
            addressId: 'addr_1',
            manualRescheduleFirstServiceDate: '2026-07-29',
            serviceDay: 'WED',
        })).rejects.toEqual(new AdminServiceError(400, 'Manual Reschedule is only available for first-service problems'));

        expect(repo.updateSubscriptionFirstServiceDate).not.toHaveBeenCalled();
    });
});
