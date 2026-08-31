import { describe, expect, it, vi } from 'vitest';
import {
    buildConfirmedAffectedSubscriptionsRecoveryPlan,
    executeConfirmedAffectedSubscriptionsRecovery,
    preflightConfirmedAffectedSubscriptionsRecovery,
    verifyConfirmedRecoveryInvariants,
    type ConfirmedRecoveryBeforeState,
    type ConfirmedRecoveryStore,
} from '@/lib/recovery/confirmedAffectedSubscriptionsRecovery';

const identities = {
    mz: { subscriptionId: 'sub_mz', allowlistedSubscriptionId: 'sub_mz' },
    mb: { subscriptionId: 'sub_mb', allowlistedSubscriptionId: 'sub_mb' },
    as: { subscriptionId: 'sub_as', allowlistedSubscriptionId: 'sub_as' },
};

describe('confirmed affected subscriptions recovery', () => {
    it('creates an opaque, Stripe-prohibited dry-run plan with the protected M.Z. dates and counts', () => {
        const plan = buildConfirmedAffectedSubscriptionsRecoveryPlan(identities);
        const mz = plan.operations[0];

        expect(plan).toMatchObject({ mode: 'dry_run', stripeMutation: 'prohibited' });
        expect(JSON.stringify(plan)).not.toMatch(/email|address|customer_name|price_/i);
        expect(mz.expectedBefore).toMatchObject({ counts: { cycles: 2, attempts: 1, stops: 1, correctionEvents: 0 } });
        expect(mz.expectedAfter).toMatchObject({
            counts: { cycles: 2, attempts: 2, stops: 2, correctionEvents: 1 },
            cycles: expect.arrayContaining([{ dueDate: '2026-09-23', state: 'open' }]),
            attempts: expect.arrayContaining([{ serviceDate: '2026-09-02', cycleDueDate: '2026-08-26', state: 'Pending', completedAt: null }]),
        });
        expect(mz.inverseRepair.retainAppendOnlyEvidence).toBe(true);
    });

    it('rejects an inferred or broad allowlist before a plan can be created', () => {
        expect(() => buildConfirmedAffectedSubscriptionsRecoveryPlan({ ...identities, mb: { subscriptionId: 'sub_mb', allowlistedSubscriptionId: 'sub_other' } }))
            .toThrow('exact allowlisted Subscription ID');
    });

    it('is read-only by default and verifies exact before-state for all three allowlisted subscriptions', async () => {
        const plan = buildConfirmedAffectedSubscriptionsRecoveryPlan(identities);
        const snapshots = new Map(plan.operations.map((operation) => [operation.subscriptionId, operation.expectedBefore]));
        const store = {
            readOnlyPreflight: vi.fn(async (id: string) => snapshots.get(id)!),
            apply: vi.fn(),
            postWriteVerify: vi.fn(),
        };

        await expect(executeConfirmedAffectedSubscriptionsRecovery(plan, store)).resolves.toBe('dry_run_verified');
        expect(store.readOnlyPreflight).toHaveBeenCalledTimes(3);
        expect(store.apply).not.toHaveBeenCalled();
        expect(store.postWriteVerify).not.toHaveBeenCalled();
    });

    it('fails closed for unavailable A.S. field evidence and does not attempt a recovery write', async () => {
        const plan = buildConfirmedAffectedSubscriptionsRecoveryPlan(identities);
        const snapshots = new Map(plan.operations.map((operation) => [operation.subscriptionId, operation.expectedBefore]));
        snapshots.set('sub_as', { ...snapshots.get('sub_as')!, fieldCleaningEvidence: { attested: false, reference: null, contradictory: false } });
        const store = { readOnlyPreflight: async (id: string) => snapshots.get(id)!, apply: vi.fn(), postWriteVerify: vi.fn() };

        await expect(preflightConfirmedAffectedSubscriptionsRecovery(plan, store)).rejects.toThrow('remains needs_review');
        expect(store.apply).not.toHaveBeenCalled();
    });

    it('only applies authorized mutation cases and then requires exact post-write verification', async () => {
        const plan = buildConfirmedAffectedSubscriptionsRecoveryPlan(identities);
        const before = new Map(plan.operations.map((operation) => [operation.subscriptionId, operation.expectedBefore]));
        const after = new Map(plan.operations.map((operation) => [operation.subscriptionId, {
            ...operation.expectedAfter,
            identity: operation.expectedBefore.identity,
            fieldCleaningEvidence: operation.expectedBefore.fieldCleaningEvidence,
        } as ConfirmedRecoveryBeforeState]));
        const store: ConfirmedRecoveryStore = {
            readOnlyPreflight: async (id) => before.get(id)!,
            apply: vi.fn(async (operation) => { before.set(operation.subscriptionId, after.get(operation.subscriptionId)!); }),
            postWriteVerify: vi.fn(async (id) => before.get(id)!),
        };

        await expect(executeConfirmedAffectedSubscriptionsRecovery(plan, store, { approvedByOperator: true, dryRun: false })).resolves.toBe('applied');
        expect(store.apply).toHaveBeenCalledTimes(2);
        expect((store.apply as ReturnType<typeof vi.fn>).mock.calls.map(([operation]) => operation.case)).toEqual(['mz_catch_up', 'as_anchor_finalization']);
        expect(store.postWriteVerify as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(3);
    });

    it('reports only count-based invariant outcomes', () => {
        expect(verifyConfirmedRecoveryInvariants({ duplicateObligations: 0, cyclesWithMultipleCompletions: 0, noncanonicalDates: 0, unexplainedParityDifferences: 0 }))
            .toEqual({ passed: true, counts: { duplicateObligations: 0, cyclesWithMultipleCompletions: 0, noncanonicalDates: 0, unexplainedParityDifferences: 0 } });
        expect(verifyConfirmedRecoveryInvariants({ duplicateObligations: 1, cyclesWithMultipleCompletions: 0, noncanonicalDates: 0, unexplainedParityDifferences: 0 }).passed).toBe(false);
    });
});
