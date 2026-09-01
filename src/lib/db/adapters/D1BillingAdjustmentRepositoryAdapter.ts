import {
    ApplyBinQuantityAdjustmentInput,
    BillingAdjustmentAudit,
    BinQuantityAdjustmentState,
    IBillingAdjustmentRepository,
    RecordBillingAdjustmentOutcomeInput,
} from '../types';

type BillingAdjustmentAuditRow = {
    audit_id: string;
    correlation_key: string;
    customer_id: string;
    subscription_id: string;
    stripe_subscription_id: string | null;
    stripe_item_id: string;
    stripe_price_id: string;
    before_total_bins: number;
    target_total_bins: number;
    before_extra_bin_quantity: number;
    target_extra_bin_quantity: number;
    operator_id: string;
    reason: string;
    requested_at: string;
    completed_at: string | null;
    outcome: BillingAdjustmentAudit['outcome'];
    recovery_classification: BillingAdjustmentAudit['recoveryClassification'];
    created_at: string;
};

export class D1BillingAdjustmentRepositoryAdapter implements IBillingAdjustmentRepository {
    constructor(private readonly db: D1Database) {}

    async getBinQuantityAdjustmentState(customerId: string, subscriptionId: string): Promise<BinQuantityAdjustmentState | null> {
        const row = await this.db.prepare(
            `SELECT c.id AS customer_id, s.id AS subscription_id,
                    s.stripe_subscription_id, c.bin_quantity
             FROM customers c
             JOIN subscriptions s ON s.customer_id = c.id
             WHERE c.id = ? AND s.id = ?`
        ).bind(customerId, subscriptionId).first<{
            customer_id: string;
            subscription_id: string;
            stripe_subscription_id: string | null;
            bin_quantity: number | null;
        }>();

        if (!row) return null;
        return {
            customerId: row.customer_id,
            subscriptionId: row.subscription_id,
            stripeSubscriptionId: row.stripe_subscription_id,
            currentTotalBins: row.bin_quantity,
        };
    }

    async getBillingAdjustmentByCorrelationKey(correlationKey: string): Promise<BillingAdjustmentAudit | null> {
        const row = await this.db.prepare(
            'SELECT * FROM billing_adjustment_audit WHERE correlation_key = ?'
        ).bind(correlationKey).first<BillingAdjustmentAuditRow>();
        return row ? this.toAudit(row) : null;
    }

    async applyBinQuantityAdjustment(input: ApplyBinQuantityAdjustmentInput): Promise<BillingAdjustmentAudit> {
        const existing = await this.getBillingAdjustmentByCorrelationKey(input.correlationKey);
        if (existing) return existing;

        await this.db.batch([
            this.db.prepare(
                `UPDATE customers
                 SET bin_quantity = ?
                 WHERE id = ?
                   AND bin_quantity = ?
                   AND ? <> ?
                   AND NOT EXISTS (
                       SELECT 1 FROM billing_adjustment_audit WHERE correlation_key = ?
                   )`
            ).bind(input.targetTotalBins, input.customerId, input.beforeTotalBins, input.beforeTotalBins, input.targetTotalBins, input.correlationKey),
            this.db.prepare(
                `INSERT INTO billing_adjustment_audit (
                    audit_id, correlation_key, customer_id, subscription_id,
                    stripe_subscription_id, stripe_item_id, stripe_price_id,
                    before_total_bins, target_total_bins,
                    before_extra_bin_quantity, target_extra_bin_quantity,
                    operator_id, reason, requested_at, completed_at,
                    outcome, recovery_classification
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    CASE
                        WHEN changes() > 0 THEN 'applied'
                        WHEN ? = ? THEN 'no_change'
                        ELSE 'recovery_required'
                    END,
                    CASE
                        WHEN changes() > 0 OR ? = ? THEN NULL
                        ELSE 'compare_and_set_conflict'
                    END
                 )`
            ).bind(
                input.auditId, input.correlationKey, input.customerId, input.subscriptionId,
                input.stripeSubscriptionId, input.stripeItemId, input.stripePriceId,
                input.beforeTotalBins, input.targetTotalBins,
                input.beforeExtraBinQuantity, input.targetExtraBinQuantity,
                input.operatorId, input.reason, input.requestedAt, input.completedAt ?? null,
                input.beforeTotalBins, input.targetTotalBins,
                input.beforeTotalBins, input.targetTotalBins,
            ),
        ]);

        const audit = await this.getBillingAdjustmentByCorrelationKey(input.correlationKey);
        if (!audit) throw new Error('Billing adjustment audit was not persisted');
        return audit;
    }

    async recordBinQuantityAdjustmentOutcome(input: RecordBillingAdjustmentOutcomeInput): Promise<BillingAdjustmentAudit> {
        const existing = await this.getBillingAdjustmentByCorrelationKey(input.correlationKey);
        if (existing) return existing;

        await this.db.prepare(
            `INSERT INTO billing_adjustment_audit (
                audit_id, correlation_key, customer_id, subscription_id,
                stripe_subscription_id, stripe_item_id, stripe_price_id,
                before_total_bins, target_total_bins,
                before_extra_bin_quantity, target_extra_bin_quantity,
                operator_id, reason, requested_at, completed_at,
                outcome, recovery_classification
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            input.auditId, input.correlationKey, input.customerId, input.subscriptionId,
            input.stripeSubscriptionId, input.stripeItemId, input.stripePriceId,
            input.beforeTotalBins, input.targetTotalBins,
            input.beforeExtraBinQuantity, input.targetExtraBinQuantity,
            input.operatorId, input.reason, input.requestedAt, input.completedAt ?? null,
            input.outcome, input.recoveryClassification,
        ).run();

        const audit = await this.getBillingAdjustmentByCorrelationKey(input.correlationKey);
        if (!audit) throw new Error('Billing adjustment audit was not persisted');
        return audit;
    }

    private toAudit(row: BillingAdjustmentAuditRow): BillingAdjustmentAudit {
        return {
            auditId: row.audit_id,
            correlationKey: row.correlation_key,
            customerId: row.customer_id,
            subscriptionId: row.subscription_id,
            stripeSubscriptionId: row.stripe_subscription_id,
            stripeItemId: row.stripe_item_id,
            stripePriceId: row.stripe_price_id,
            beforeTotalBins: row.before_total_bins,
            targetTotalBins: row.target_total_bins,
            beforeExtraBinQuantity: row.before_extra_bin_quantity,
            targetExtraBinQuantity: row.target_extra_bin_quantity,
            operatorId: row.operator_id,
            reason: row.reason,
            requestedAt: row.requested_at,
            completedAt: row.completed_at,
            outcome: row.outcome,
            recoveryClassification: row.recovery_classification,
            createdAt: row.created_at,
        };
    }
}
