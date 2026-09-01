import { beforeEach, describe, expect, it } from 'vitest';
import { D1BillingAdjustmentRepositoryAdapter } from '@/lib/db/adapters/D1BillingAdjustmentRepositoryAdapter';
import { DbSimulator } from './db-simulator';

describe('D1 bin quantity adjustment persistence', () => {
    let simulator: DbSimulator;
    let repository: D1BillingAdjustmentRepositoryAdapter;

    beforeEach(() => {
        simulator = new DbSimulator();
        repository = new D1BillingAdjustmentRepositoryAdapter(simulator as unknown as D1Database);
        simulator.db.prepare(
            'INSERT INTO customers (id, email, stripe_customer_id, bin_quantity) VALUES (?, ?, ?, ?)'
        ).run('customer_bins', 'bins@example.test', 'cus_bins', 3);
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
        ).run('subscription_bins', 'customer_bins', 'sub_bins', 'active', 28);
        simulator.db.prepare(
            'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, bin_quantity) VALUES (?, ?, ?, ?, ?)'
        ).run('history_bins', 'subscription_bins', '2026-08-01', 'Completed', 3);
    });

    const appliedInput = () => ({
        auditId: 'billing_adjustment_1',
        correlationKey: 'bins-change-1',
        customerId: 'customer_bins',
        subscriptionId: 'subscription_bins',
        stripeSubscriptionId: 'sub_bins',
        stripeItemId: 'si_bins',
        stripePriceId: 'price_extra_monthly',
        beforeTotalBins: 3,
        targetTotalBins: 4,
        beforeExtraBinQuantity: 1,
        targetExtraBinQuantity: 2,
        operatorId: 'operator_1',
        reason: 'customer requested one additional bin',
        requestedAt: '2026-09-01T13:00:00.000Z',
        completedAt: '2026-09-01T13:01:00.000Z',
    });

    it('exposes the local and Stripe comparison state without fulfillment data', async () => {
        const columns = simulator.db.prepare('PRAGMA table_info(billing_adjustment_audit)').all() as Array<{ name: string }>;
        expect(columns.map(column => column.name)).toEqual(expect.arrayContaining([
            'correlation_key', 'customer_id', 'subscription_id', 'stripe_subscription_id',
            'stripe_item_id', 'stripe_price_id', 'before_total_bins', 'target_total_bins',
            'before_extra_bin_quantity', 'target_extra_bin_quantity', 'operator_id',
            'reason', 'requested_at', 'completed_at', 'outcome', 'recovery_classification', 'created_at',
        ]));

        await expect(repository.getBinQuantityAdjustmentState('customer_bins', 'subscription_bins')).resolves.toEqual({
            customerId: 'customer_bins',
            subscriptionId: 'subscription_bins',
            stripeSubscriptionId: 'sub_bins',
            currentTotalBins: 3,
        });
    });

    it('updates customers and appends the applied audit row atomically', async () => {
        await expect(repository.applyBinQuantityAdjustment(appliedInput())).resolves.toMatchObject({ outcome: 'applied' });

        expect(simulator.db.prepare('SELECT bin_quantity FROM customers WHERE id = ?').get('customer_bins')).toEqual({ bin_quantity: 4 });
        expect(simulator.db.prepare('SELECT stripe_item_id, stripe_price_id, before_total_bins, target_total_bins, before_extra_bin_quantity, target_extra_bin_quantity, operator_id, outcome FROM billing_adjustment_audit').get())
            .toEqual({ stripe_item_id: 'si_bins', stripe_price_id: 'price_extra_monthly', before_total_bins: 3, target_total_bins: 4, before_extra_bin_quantity: 1, target_extra_bin_quantity: 2, operator_id: 'operator_1', outcome: 'applied' });
    });

    it('records no_change without rewriting the customer or service history', async () => {
        const input = { ...appliedInput(), targetTotalBins: 3, targetExtraBinQuantity: 1, auditId: 'billing_adjustment_no_change', correlationKey: 'bins-no-change' };
        await expect(repository.applyBinQuantityAdjustment(input)).resolves.toMatchObject({ outcome: 'no_change' });

        expect(simulator.db.prepare('SELECT bin_quantity FROM customers WHERE id = ?').get('customer_bins')).toEqual({ bin_quantity: 3 });
        expect(simulator.db.prepare('SELECT dispatch_status, bin_quantity FROM service_history WHERE id = ?').get('history_bins')).toEqual({ dispatch_status: 'Completed', bin_quantity: 3 });
    });

    it('is idempotent by correlation key and leaves the original evidence unchanged', async () => {
        const first = await repository.applyBinQuantityAdjustment(appliedInput());
        const replay = await repository.applyBinQuantityAdjustment({ ...appliedInput(), auditId: 'different_id', targetTotalBins: 5 });

        expect(replay).toEqual(first);
        expect(simulator.db.prepare('SELECT bin_quantity FROM customers WHERE id = ?').get('customer_bins')).toEqual({ bin_quantity: 4 });
        expect(simulator.db.prepare('SELECT count(*) AS count FROM billing_adjustment_audit').get()).toEqual({ count: 1 });
    });

    it('records a compare-and-set conflict as recovery_required without overwriting current state', async () => {
        await repository.applyBinQuantityAdjustment(appliedInput());
        const result = await repository.applyBinQuantityAdjustment({
            ...appliedInput(),
            auditId: 'billing_adjustment_conflict',
            correlationKey: 'bins-conflict',
            targetTotalBins: 5,
            targetExtraBinQuantity: 3,
        });

        expect(result).toMatchObject({ outcome: 'recovery_required', recoveryClassification: 'compare_and_set_conflict' });
        expect(simulator.db.prepare('SELECT bin_quantity FROM customers WHERE id = ?').get('customer_bins')).toEqual({ bin_quantity: 4 });
    });

    it('supports an append-only recovery outcome without changing local or fulfillment state', async () => {
        await repository.recordBinQuantityAdjustmentOutcome({
            ...appliedInput(),
            auditId: 'billing_adjustment_recovery',
            correlationKey: 'bins-recovery',
            outcome: 'recovery_required',
            recoveryClassification: 'stripe_update_failed',
        });

        expect(simulator.db.prepare('SELECT bin_quantity FROM customers WHERE id = ?').get('customer_bins')).toEqual({ bin_quantity: 3 });
        expect(simulator.db.prepare('SELECT outcome, recovery_classification FROM billing_adjustment_audit').get()).toEqual({ outcome: 'recovery_required', recovery_classification: 'stripe_update_failed' });
        expect(() => simulator.db.prepare('DELETE FROM billing_adjustment_audit WHERE correlation_key = ?').run('bins-recovery')).toThrow('Billing adjustment audit is append-only');
    });

    it('supports rolled_back as an audit-only outcome', async () => {
        await repository.recordBinQuantityAdjustmentOutcome({
            ...appliedInput(),
            auditId: 'billing_adjustment_rollback',
            correlationKey: 'bins-rollback',
            outcome: 'rolled_back',
            recoveryClassification: 'stripe_rollback_failed',
        });

        expect(simulator.db.prepare('SELECT outcome, recovery_classification FROM billing_adjustment_audit').get()).toEqual({ outcome: 'rolled_back', recovery_classification: 'stripe_rollback_failed' });
        expect(simulator.db.prepare('SELECT bin_quantity FROM customers WHERE id = ?').get('customer_bins')).toEqual({ bin_quantity: 3 });
    });

    it('rolls back the customer update if audit insertion fails', async () => {
        await repository.recordBinQuantityAdjustmentOutcome({
            ...appliedInput(),
            auditId: 'duplicate-audit-id',
            correlationKey: 'existing-audit',
            outcome: 'recovery_required',
            recoveryClassification: 'invalid_state',
        });

        await expect(repository.applyBinQuantityAdjustment({
            ...appliedInput(),
            auditId: 'duplicate-audit-id',
            correlationKey: 'new-audit',
        })).rejects.toThrow();

        expect(simulator.db.prepare('SELECT bin_quantity FROM customers WHERE id = ?').get('customer_bins')).toEqual({ bin_quantity: 3 });
        expect(simulator.db.prepare('SELECT count(*) AS count FROM billing_adjustment_audit').get()).toEqual({ count: 1 });
    });
});
