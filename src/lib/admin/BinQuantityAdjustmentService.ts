import type { ApplyBinQuantityAdjustmentInput, BillingAdjustmentAudit, IBillingAdjustmentRepository, ICustomerRepository, ISubscriptionRepository } from '@/lib/db/types';
import type { StripeBinQuantityAdjustmentPaymentService } from '@/lib/payment/types';

export interface BinQuantityAdjustmentInput { customerId: string; targetBins: number; reason: string; correlationKey: string; }
export interface BinQuantityPreviewBeforeState { d1Bins: number; stripeCadenceDays: 28 | 56 | 84; stripeBasePriceId: string; stripeExtraBinQuantity: number; stripeExtraBinPriceId: string; stripeExtraBinSubscriptionItemId: string; stripeCustomerBinQuantity: number | null; }
export interface BinQuantityAdjustmentPreview { customerId: string; targetBins: number; before: BinQuantityPreviewBeforeState; mismatch: boolean; requiresNoProration: true; subscriptionSupported: true; }
export interface ConfirmBinQuantityAdjustmentInput extends BinQuantityAdjustmentInput { previewBefore: BinQuantityPreviewBeforeState; }
export type BinQuantityRepository = ICustomerRepository & ISubscriptionRepository & IBillingAdjustmentRepository;

export interface AdminBinQuantityAdjustmentService {
    preview(input: BinQuantityAdjustmentInput): Promise<BinQuantityAdjustmentPreview>;
    confirm(input: ConfirmBinQuantityAdjustmentInput): Promise<{ customerId: string; targetBins: number; status: string }>;
}

export class BinQuantityAdjustmentService {
    constructor(private readonly repository: BinQuantityRepository, private readonly paymentService: StripeBinQuantityAdjustmentPaymentService, private readonly operatorId = 'admin') {}

    async preview(input: BinQuantityAdjustmentInput): Promise<BinQuantityAdjustmentPreview> {
        this.validateInput(input);
        try {
            const state = await this.getCurrentState(input.customerId);
            const stripe = await this.paymentService.getBinQuantityAdjustmentState(state.stripeCustomerId, state.stripeSubscriptionId);
            if (stripe.cadenceDays !== state.frequencyDays) throw new AdminServiceError(409, 'Stripe cadence does not match the local Subscription');
            if (state.currentTotalBins === null || state.currentTotalBins < 2) throw new AdminServiceError(409, 'Current local bin quantity is unavailable');
            return { customerId: input.customerId, targetBins: input.targetBins, before: { d1Bins: state.currentTotalBins, stripeCadenceDays: stripe.cadenceDays, stripeBasePriceId: stripe.basePriceId, stripeExtraBinQuantity: stripe.extraBinQuantity, stripeExtraBinPriceId: stripe.extraBinPriceId, stripeExtraBinSubscriptionItemId: stripe.extraBinSubscriptionItemId, stripeCustomerBinQuantity: stripe.customerBinQuantity }, mismatch: stripe.extraBinQuantity !== state.currentTotalBins - 2 || (stripe.customerBinQuantity !== null && stripe.customerBinQuantity !== state.currentTotalBins), requiresNoProration: true, subscriptionSupported: true };
        } catch (error) { throw sanitizeError(error); }
    }

    async confirm(input: ConfirmBinQuantityAdjustmentInput): Promise<{ customerId: string; targetBins: number; status: string }> {
        this.validateInput(input);
        try {
            const existing = await this.repository.getBillingAdjustmentByCorrelationKey(input.correlationKey);
            if (existing) return this.resultFromAudit(existing);
            const state = await this.getCurrentState(input.customerId);
            const stripe = await this.paymentService.getBinQuantityAdjustmentState(state.stripeCustomerId, state.stripeSubscriptionId);
            if (state.currentTotalBins !== input.previewBefore.d1Bins || stripe.cadenceDays !== input.previewBefore.stripeCadenceDays || stripe.basePriceId !== input.previewBefore.stripeBasePriceId || stripe.extraBinQuantity !== input.previewBefore.stripeExtraBinQuantity || stripe.extraBinPriceId !== input.previewBefore.stripeExtraBinPriceId || stripe.extraBinSubscriptionItemId !== input.previewBefore.stripeExtraBinSubscriptionItemId || stripe.customerBinQuantity !== input.previewBefore.stripeCustomerBinQuantity || state.currentTotalBins === null) throw new AdminServiceError(409, 'The bin quantity changed since preview; refresh and try again');
            const auditInput = this.auditInput(input, state, stripe, new Date().toISOString());
            if (input.targetBins === state.currentTotalBins) return this.resultFromAudit(await this.repository.applyBinQuantityAdjustment(auditInput));
            try {
                await this.paymentService.updateBinQuantityAdjustment({ customerId: state.stripeCustomerId, subscriptionId: state.stripeSubscriptionId, extraBinSubscriptionItemId: stripe.extraBinSubscriptionItemId, extraBinQuantity: input.targetBins - 2, binQuantity: input.targetBins, idempotencyKey: input.correlationKey });
                const audit = await this.repository.applyBinQuantityAdjustment(auditInput);
                if (audit.outcome !== 'applied') { const rolledBack = await this.rollbackStripe(state.stripeCustomerId, state.stripeSubscriptionId, stripe, state.currentTotalBins, input.correlationKey); await this.recordOutcome(auditInput, audit.auditId, rolledBack ? 'rolled_back' : 'recovery_required', rolledBack ? 'compare_and_set_conflict' : 'stripe_rollback_failed'); throw new AdminServiceError(409, rolledBack ? 'The bin quantity changed while applying the operation; Stripe was rolled back' : 'The bin quantity changed; manual recovery is required'); }
                return { customerId: input.customerId, targetBins: input.targetBins, status: 'applied' };
            } catch (error) {
                if (error instanceof AdminServiceError) throw error;
                const rolledBack = await this.rollbackStripe(state.stripeCustomerId, state.stripeSubscriptionId, stripe, state.currentTotalBins, input.correlationKey);
                await this.recordOutcome(auditInput, auditInput.auditId, rolledBack ? 'rolled_back' : 'recovery_required', rolledBack ? 'stripe_update_failed' : 'stripe_rollback_failed');
                throw new AdminServiceError(502, rolledBack ? 'Bin quantity change failed and Stripe was rolled back' : 'Bin quantity change failed; manual recovery is required');
            }
        } catch (error) { throw sanitizeError(error); }
    }

    private async getCurrentState(customerId: string) {
        const subscription = await this.repository.getSubscriptionByCustomerId(customerId);
        if (!subscription || subscription.status !== 'active' || ![28, 56, 84].includes(subscription.frequency_days)) throw new AdminServiceError(409, 'Only an active recurring Subscription can be adjusted');
        if (!subscription.stripe_subscription_id) throw new AdminServiceError(409, 'Subscription is missing its Stripe reference');
        const state = await this.repository.getBinQuantityAdjustmentState(customerId, subscription.id);
        const stripeCustomerId = await this.repository.getStripeCustomerId(customerId);
        if (!state || !stripeCustomerId || state.stripeSubscriptionId !== subscription.stripe_subscription_id) throw new AdminServiceError(409, 'Local billing state is unavailable');
        return { ...state, stripeCustomerId, stripeSubscriptionId: subscription.stripe_subscription_id, frequencyDays: subscription.frequency_days };
    }

    private auditInput(input: BinQuantityAdjustmentInput, state: Awaited<ReturnType<BinQuantityAdjustmentService['getCurrentState']>>, stripe: Awaited<ReturnType<StripeBinQuantityAdjustmentPaymentService['getBinQuantityAdjustmentState']>>, requestedAt: string): ApplyBinQuantityAdjustmentInput {
        if (state.currentTotalBins === null) throw new AdminServiceError(409, 'Current local bin quantity is unavailable');
        return { auditId: `billing-adjustment:${input.correlationKey}`, correlationKey: input.correlationKey, customerId: input.customerId, subscriptionId: state.subscriptionId, stripeSubscriptionId: state.stripeSubscriptionId, stripeItemId: stripe.extraBinSubscriptionItemId, stripePriceId: stripe.extraBinPriceId, beforeTotalBins: state.currentTotalBins, targetTotalBins: input.targetBins, beforeExtraBinQuantity: stripe.extraBinQuantity, targetExtraBinQuantity: input.targetBins - 2, operatorId: this.operatorId, reason: input.reason.trim(), requestedAt };
    }

    private async rollbackStripe(customerId: string, subscriptionId: string, before: Awaited<ReturnType<StripeBinQuantityAdjustmentPaymentService['getBinQuantityAdjustmentState']>>, bins: number, correlationKey: string): Promise<boolean> { try { await this.paymentService.updateBinQuantityAdjustment({ customerId, subscriptionId, extraBinSubscriptionItemId: before.extraBinSubscriptionItemId, extraBinQuantity: before.extraBinQuantity, binQuantity: bins, idempotencyKey: `${correlationKey}:rollback` }); return true; } catch { return false; } }
    private async recordOutcome(input: ApplyBinQuantityAdjustmentInput, auditId: string, outcome: 'failed' | 'rolled_back' | 'recovery_required', recoveryClassification: 'stripe_update_failed' | 'stripe_rollback_failed' | 'compare_and_set_conflict' | 'invalid_state') { try { await this.repository.recordBinQuantityAdjustmentOutcome({ ...input, auditId, outcome, recoveryClassification }); } catch { /* retain the primary sanitized error */ } }
    private resultFromAudit(audit: BillingAdjustmentAudit) { return { customerId: audit.customerId, targetBins: audit.targetTotalBins, status: audit.outcome }; }
    private validateInput(input: BinQuantityAdjustmentInput): void { if (!input.customerId?.trim()) throw new AdminServiceError(400, 'Customer ID is required'); if (!Number.isInteger(input.targetBins) || input.targetBins < 2) throw new AdminServiceError(400, 'Target bins must be an integer of at least 2'); if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) throw new AdminServiceError(400, 'A valid reason is required'); if (typeof input.correlationKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.correlationKey)) throw new AdminServiceError(400, 'Invalid correlation key'); }
}

function sanitizeError(error: unknown): AdminServiceError { return error instanceof AdminServiceError ? error : new AdminServiceError(500, 'Unable to complete bin quantity adjustment'); }
export class AdminServiceError extends Error { constructor(readonly status: number, message: string) { super(message); } }
