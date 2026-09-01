import { describe, expect, it, vi } from 'vitest';
import { BinQuantityAdjustmentService, AdminServiceError, BinQuantityRepository } from '@/lib/admin/BinQuantityAdjustmentService';
import type { StripeBinQuantityAdjustmentPaymentService } from '@/lib/payment/types';

const stripeState = { customerId: 'cus_1', subscriptionId: 'sub_stripe', status: 'active', cadenceDays: 28 as const, basePriceId: 'price_base', extraBinPriceId: 'price_extra', extraBinSubscriptionItemId: 'si_extra', extraBinQuantity: 1, customerBinQuantity: 3 };
const audit = (outcome: 'applied' | 'no_change' = 'applied') => ({ auditId: 'audit_1', correlationKey: 'change-1', customerId: 'customer_1', subscriptionId: 'sub_1', stripeSubscriptionId: 'sub_stripe', stripeItemId: 'si_extra', stripePriceId: 'price_extra', beforeTotalBins: 3, targetTotalBins: 4, beforeExtraBinQuantity: 1, targetExtraBinQuantity: 2, operatorId: 'admin', reason: 'Customer request', requestedAt: '2026-09-01T00:00:00.000Z', completedAt: null, outcome, recoveryClassification: null, createdAt: '2026-09-01T00:00:00.000Z' });

function setup(overrides: Record<string, unknown> = {}) {
    const repository = {
        getStripeCustomerId: vi.fn().mockResolvedValue('cus_1'),
        getSubscriptionByCustomerId: vi.fn().mockResolvedValue({ id: 'sub_1', customer_id: 'customer_1', stripe_subscription_id: 'sub_stripe', status: 'active', frequency_days: 28 }),
        getBinQuantityAdjustmentState: vi.fn().mockResolvedValue({ customerId: 'customer_1', subscriptionId: 'sub_1', stripeSubscriptionId: 'sub_stripe', currentTotalBins: 3 }),
        getBillingAdjustmentByCorrelationKey: vi.fn().mockResolvedValue(null),
        applyBinQuantityAdjustment: vi.fn().mockResolvedValue(audit()),
        recordBinQuantityAdjustmentOutcome: vi.fn().mockResolvedValue(audit('no_change')),
        ...overrides,
    };
    const payment = {
        getBinQuantityAdjustmentState: vi.fn().mockResolvedValue({ ...stripeState }),
        updateBinQuantityAdjustment: vi.fn().mockResolvedValue({ ...stripeState, extraBinQuantity: 2, customerBinQuantity: 4 }),
    };
    return { repository, payment, service: new BinQuantityAdjustmentService(repository as unknown as BinQuantityRepository, payment as unknown as StripeBinQuantityAdjustmentPaymentService) };
}

describe('BinQuantityAdjustmentService', () => {
    it('previews the exact local and Stripe before-state', async () => {
        const { service } = setup();
        await expect(service.preview({ customerId: 'customer_1', targetBins: 4, reason: 'Customer request', correlationKey: 'change-1' })).resolves.toMatchObject({ before: { d1Bins: 3, stripeExtraBinQuantity: 1, stripeExtraBinPriceId: 'price_extra' }, requiresNoProration: true });
    });

    it('rejects a stale preview before touching either provider', async () => {
        const { service, payment } = setup();
        await expect(service.confirm({ customerId: 'customer_1', targetBins: 4, reason: 'Customer request', correlationKey: 'change-1', previewBefore: { d1Bins: 2, stripeCadenceDays: 28, stripeBasePriceId: 'price_base', stripeExtraBinQuantity: 0, stripeExtraBinPriceId: 'price_extra', stripeExtraBinSubscriptionItemId: 'si_extra', stripeCustomerBinQuantity: 2 } })).rejects.toEqual(new AdminServiceError(409, 'The bin quantity changed since preview; refresh and try again'));
        expect(payment.updateBinQuantityAdjustment).not.toHaveBeenCalled();
    });

    it('returns a persisted no-change result without a Stripe write', async () => {
        const { service, payment, repository } = setup({ getBinQuantityAdjustmentState: vi.fn().mockResolvedValue({ customerId: 'customer_1', subscriptionId: 'sub_1', stripeSubscriptionId: 'sub_stripe', currentTotalBins: 3 }), applyBinQuantityAdjustment: vi.fn().mockResolvedValue(audit('no_change')) });
        const result = await service.confirm({ customerId: 'customer_1', targetBins: 3, reason: 'No change needed', correlationKey: 'change-1', previewBefore: { d1Bins: 3, stripeCadenceDays: 28, stripeBasePriceId: 'price_base', stripeExtraBinQuantity: 1, stripeExtraBinPriceId: 'price_extra', stripeExtraBinSubscriptionItemId: 'si_extra', stripeCustomerBinQuantity: 3 } });
        expect(result.status).toBe('no_change');
        expect(payment.updateBinQuantityAdjustment).not.toHaveBeenCalled();
        expect(repository.applyBinQuantityAdjustment).toHaveBeenCalledOnce();
    });

    it('attempts Stripe rollback and records recovery outcome when D1 fails', async () => {
        const { service, payment, repository } = setup({ applyBinQuantityAdjustment: vi.fn().mockRejectedValue(new Error('D1 unavailable')) });
        await expect(service.confirm({ customerId: 'customer_1', targetBins: 4, reason: 'Customer request', correlationKey: 'change-1', previewBefore: { d1Bins: 3, stripeCadenceDays: 28, stripeBasePriceId: 'price_base', stripeExtraBinQuantity: 1, stripeExtraBinPriceId: 'price_extra', stripeExtraBinSubscriptionItemId: 'si_extra', stripeCustomerBinQuantity: 3 } })).rejects.toEqual(new AdminServiceError(502, 'Bin quantity change failed and Stripe was rolled back'));
        expect(payment.updateBinQuantityAdjustment).toHaveBeenCalledTimes(2);
        expect(repository.recordBinQuantityAdjustmentOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'rolled_back', recoveryClassification: 'stripe_update_failed' }));
    });
});
