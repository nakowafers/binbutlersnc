import { beforeEach, describe, expect, it } from 'vitest';
import { D1ServiceCycleRecoveryReviewRepository, persistNeedsReviewClassifications } from '@/lib/reports/D1ServiceCycleRecoveryReviewRepository';

type Stored = { subscription_id: string; classification: 'needs_review'; reason: string; observed_at: string };

class MemoryRecoveryReviewD1 {
    row: Stored | null = null;
    writeCount = 0;

    prepare(query: string) {
        return {
            bind: (...args: string[]) => ({
                run: async () => {
                    if (!/INSERT INTO subscription_recovery_reviews/.test(query)) throw new Error(`Unexpected write query: ${query}`);
                    const [subscriptionId, reason, observedAt] = args;
                    const next: Stored = { subscription_id: subscriptionId, classification: 'needs_review', reason, observed_at: observedAt };
                    if (JSON.stringify(this.row) !== JSON.stringify(next)) {
                        this.row = next;
                        this.writeCount += 1;
                    }
                    return { success: true, meta: { changes: 1 } };
                },
                first: async () => /SELECT subscription_id, classification, reason, observed_at/.test(query) ? this.row : null,
            }),
        };
    }
}

describe('D1 Service Cycle recovery review repository', () => {
    let db: MemoryRecoveryReviewD1;
    let repository: D1ServiceCycleRecoveryReviewRepository;

    beforeEach(() => {
        db = new MemoryRecoveryReviewD1();
        repository = new D1ServiceCycleRecoveryReviewRepository(db as unknown as D1Database);
    });

    const input = {
        subscriptionId: 'subscription_review',
        classification: { status: 'needs_review' as const, anchor: null, reason: 'cadence_mismatch' as const },
        observedAt: '2026-08-30T12:00:00.000Z',
    };

    it('upserts a PII-free needs_review classification idempotently and verifies it read-only', async () => {
        const first = await repository.upsertNeedsReview(input);
        const replay = await repository.upsertNeedsReview(input);

        expect(first).toEqual({ subscriptionId: 'subscription_review', classification: 'needs_review', reason: 'cadence_mismatch', observedAt: input.observedAt });
        expect(replay).toEqual(first);
        expect(db.row).toEqual({ subscription_id: 'subscription_review', classification: 'needs_review', reason: 'cadence_mismatch', observed_at: input.observedAt });
        expect(db.writeCount).toBe(1);
        await expect(repository.verifyNeedsReview(first)).resolves.toBe(true);
        expect(JSON.stringify(first)).not.toMatch(/@|email|address|stripe|price/i);
    });

    it('does not persist verified classifications', async () => {
        await expect(repository.upsertNeedsReview({
            ...input,
            classification: { status: 'verified', anchor: '2026-09-01', reason: null },
        })).rejects.toThrow('Only needs_review');
        expect(db.row).toBeNull();
    });

    it('persists and verifies only needs_review rows from an audit inventory', async () => {
        const records = await persistNeedsReviewClassifications(repository, [
            { subscriptionId: 'subscription_verified', classification: { status: 'verified', anchor: '2026-09-01', reason: null } },
            { subscriptionId: input.subscriptionId, classification: input.classification },
        ], input.observedAt);

        expect(records).toEqual([
            { subscriptionId: input.subscriptionId, classification: 'needs_review', reason: 'cadence_mismatch', observedAt: input.observedAt },
        ]);
        expect(db.writeCount).toBe(1);
    });
});
