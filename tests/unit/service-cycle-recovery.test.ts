import { describe, expect, it } from 'vitest';
import {
    buildBackfillPlan,
    classifyServiceCycleRecovery,
    executeBackfillPlan,
    normalizeHistoricalServiceDate,
    type RecoverySubscription,
    type StripeSubscriptionEvidence,
} from '@/lib/reports/serviceCycleRecovery';

const subscription: RecoverySubscription = {
    id: 'sub_1',
    status: 'active',
    serviceDay: 'TUE',
    frequencyDays: 28,
    currentPeriodEnd: '2026-09-29T04:00:00.000Z',
    serviceCycleAnchor: null,
};

const stripe: StripeSubscriptionEvidence = {
    status: 'active',
    billingCycleAnchor: '2026-09-01T04:00:00.000Z',
    currentPeriodEnd: '2026-09-29T04:00:00.000Z',
    recurringPrice: { id: 'price_monthly', intervalDays: 28 },
};

describe('Service Cycle recovery classification', () => {
    it('verifies an anchor only when independent Stripe, local period, Service Day, and completion evidence agree', () => {
        const result = classifyServiceCycleRecovery({
            subscription,
            stripe,
            history: [{ id: 'history_1', serviceDate: '2026-09-01', dispatchStatus: 'Completed', completedAt: '2026-09-01T18:00:00.000Z' }],
            stops: [{ id: 'stop_1', serviceHistoryId: 'history_1', serviceDate: '2026-09-01', dispatchStatus: 'completed' }],
        });

        expect(result).toMatchObject({ status: 'verified', anchor: '2026-09-01', reason: null });
    });

    it('treats a Stripe trial as active service while rejecting incompatible lifecycle state', () => {
        expect(classifyServiceCycleRecovery({ subscription, stripe: { ...stripe, status: 'trialing' }, history: [], stops: [] }))
            .toMatchObject({ status: 'verified' });
        expect(classifyServiceCycleRecovery({ subscription, stripe: { ...stripe, status: 'canceled' }, history: [], stops: [] }))
            .toMatchObject({ status: 'needs_review', reason: 'stripe_status_mismatch' });
    });

    it('never treats the latest completion as sufficient authority for an anchor', () => {
        const result = classifyServiceCycleRecovery({
            subscription,
            stripe: null,
            history: [{ id: 'history_1', serviceDate: '2026-09-01', dispatchStatus: 'Completed', completedAt: '2026-09-01T18:00:00.000Z' }],
            stops: [],
        });

        expect(result).toMatchObject({ status: 'needs_review', reason: 'missing_stripe_evidence' });
    });

    it.each([
        ['unknown price', { ...stripe, recurringPrice: null }, 'unknown_price'],
        ['weekday mismatch', { ...stripe, billingCycleAnchor: '2026-09-02T04:00:00.000Z' }, 'weekday_mismatch'],
        ['period mismatch', { ...stripe, currentPeriodEnd: '2026-09-30T04:00:00.000Z' }, 'period_mismatch'],
    ])('routes %s to controlled review', (_label, evidence, reason) => {
        expect(classifyServiceCycleRecovery({ subscription, stripe: evidence, history: [], stops: [] }))
            .toMatchObject({ status: 'needs_review', reason });
    });

    it('rejects linked route/history date disagreement and contradictory completion chronology', () => {
        const routeMismatch = classifyServiceCycleRecovery({
            subscription, stripe, history: [{ id: 'history_1', serviceDate: '2026-09-01', dispatchStatus: 'Completed', completedAt: '2026-09-01T18:00:00.000Z' }],
            stops: [{ id: 'stop_1', serviceHistoryId: 'history_1', serviceDate: '2026-09-02', dispatchStatus: 'completed' }],
        });
        const chronologyMismatch = classifyServiceCycleRecovery({
            subscription, stripe,
            history: [{ id: 'history_1', serviceDate: '2026-09-01', dispatchStatus: 'Completed', completedAt: '2026-08-31T18:00:00.000Z' }], stops: [],
        });

        expect(routeMismatch).toMatchObject({ status: 'needs_review', reason: 'route_history_disagreement' });
        expect(chronologyMismatch).toMatchObject({ status: 'needs_review', reason: 'completion_chronology_conflict' });
    });

    it('does not overwrite a conflicting existing local anchor', () => {
        const result = classifyServiceCycleRecovery({
            subscription: { ...subscription, serviceCycleAnchor: '2026-08-04' }, stripe, history: [], stops: [],
        });

        expect(result).toMatchObject({ status: 'needs_review', reason: 'contradictory_evidence' });
    });
});

describe('historical Service Date normalization', () => {
    it.each([
        ['2026-03-08T05:00:00.000Z', '2026-03-08'], // DST boundary
        ['2024-02-29T17:00:00.000Z', '2024-02-29'], // leap day
    ])('normalizes unambiguous timestamp %s in Eastern time', (value, expected) => {
        expect(normalizeHistoricalServiceDate({ value, linkedValues: [value], existingCanonicalDates: [] }))
            .toMatchObject({ status: 'normalized', normalizedDate: expected });
    });

    it.each([
        ['2026-09-01T00:00:00.000Z', ['2026-09-01T00:00:00.000Z'], [], 'midnight_boundary'],
        ['2026-09-01T16:00:00.000Z', ['2026-09-02T16:00:00.000Z'], [], 'route_history_disagreement'],
        ['2026-09-01T16:00:00.000Z', ['2026-09-01T16:00:00.000Z'], ['2026-09-01'], 'normalized_collision'],
    ])('does not normalize %s when %s applies', (value, linkedValues, existingCanonicalDates, reason) => {
        expect(normalizeHistoricalServiceDate({ value, linkedValues, existingCanonicalDates }))
            .toMatchObject({ status: 'needs_review', reason });
    });
});

describe('backfill planning', () => {
    it('creates an allowlisted, idempotent plan with inverse repairs and no invented fulfillment', () => {
        const plan = buildBackfillPlan({
            classification: { status: 'verified', anchor: '2026-09-01', reason: null },
            subscription,
            history: [{ id: 'history_1', serviceDate: '2026-09-01', dispatchStatus: 'Completed', completedAt: '2026-09-01T18:00:00.000Z' }],
            stops: [{ id: 'stop_1', serviceHistoryId: 'history_1', serviceDate: '2026-09-01', dispatchStatus: 'completed' }],
            throughDate: '2026-09-29',
        });

        expect(plan.operations).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: 'set_anchor', beforeState: null, expectedCounts: { subscriptions: 1 }, inverse: expect.any(Object) }),
            expect.objectContaining({ kind: 'create_cycle', cycleDueDate: '2026-09-01' }),
            expect.objectContaining({ kind: 'fulfill_cycle', cycleDueDate: '2026-09-01', evidenceHistoryId: 'history_1' }),
        ]));
        expect(plan.operations.every((operation) => operation.idempotencyKey.startsWith('service-cycle-recovery:sub_1:'))).toBe(true);
    });

    it('refuses to plan changes for a review classification', () => {
        expect(() => buildBackfillPlan({
            classification: { status: 'needs_review', anchor: null, reason: 'unknown_price' }, subscription, history: [], stops: [], throughDate: '2026-09-29',
        })).toThrow('verified anchor');
    });
});

describe('backfill execution guardrails', () => {
    it('is dry-run by default and verifies every applied operation', async () => {
        const plan = buildBackfillPlan({
            classification: { status: 'verified', anchor: '2026-09-01', reason: null }, subscription, history: [], stops: [], throughDate: '2026-09-01',
        });
        const calls: string[] = [];
        const store = {
            assertBeforeState: async (operation: { kind: string }) => { calls.push(`before:${operation.kind}`); },
            apply: async (operation: { kind: string }) => { calls.push(`apply:${operation.kind}`); },
            verify: async (operation: { kind: string }) => { calls.push(`verify:${operation.kind}`); },
            repair: async () => { calls.push('repair'); },
        };

        await expect(executeBackfillPlan(plan, store)).resolves.toMatchObject({ mode: 'dry_run' });
        expect(calls).toEqual(['before:set_anchor', 'before:create_cycle']);

        calls.length = 0;
        await expect(executeBackfillPlan(plan, store, { dryRun: false })).resolves.toMatchObject({ mode: 'applied' });
        expect(calls).toEqual(['before:set_anchor', 'before:create_cycle', 'apply:set_anchor', 'verify:set_anchor', 'apply:create_cycle', 'verify:create_cycle']);
    });

    it('repairs only already-applied operations when verification fails', async () => {
        const plan = buildBackfillPlan({
            classification: { status: 'verified', anchor: '2026-09-01', reason: null }, subscription, history: [], stops: [], throughDate: '2026-09-01',
        });
        const repairs: string[] = [];
        const store = {
            assertBeforeState: async () => undefined,
            apply: async () => undefined,
            verify: async (operation: { kind: string }) => { if (operation.kind === 'create_cycle') throw new Error('count mismatch'); },
            repair: async (operation: { kind: string }) => { repairs.push(operation.kind); },
        };

        await expect(executeBackfillPlan(plan, store, { dryRun: false })).rejects.toThrow('count mismatch');
        expect(repairs).toEqual(['create_cycle', 'set_anchor']);
    });
});
