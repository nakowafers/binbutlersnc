import type { RecoveryClassification, RecoveryReviewReason } from './serviceCycleRecovery';

export interface RecoveryNeedsReviewRecord {
    subscriptionId: string;
    classification: 'needs_review';
    reason: RecoveryReviewReason;
    observedAt: string;
}

export interface RecoveryClassificationRecord {
    subscriptionId: string;
    classification: RecoveryClassification;
}

type StoredRecoveryNeedsReview = {
    subscription_id: string;
    classification: 'needs_review';
    reason: RecoveryReviewReason;
    observed_at: string;
};

function recordFrom(row: StoredRecoveryNeedsReview): RecoveryNeedsReviewRecord {
    return {
        subscriptionId: row.subscription_id,
        classification: row.classification,
        reason: row.reason,
        observedAt: row.observed_at,
    };
}

/** PII-free storage for recovery blockers. It never stores Stripe IDs or source evidence. */
export class D1ServiceCycleRecoveryReviewRepository {
    constructor(private readonly db: D1Database) {}

    async upsertNeedsReview(input: {
        subscriptionId: string;
        classification: RecoveryClassification;
        observedAt: string;
    }): Promise<RecoveryNeedsReviewRecord> {
        if (input.classification.status !== 'needs_review') {
            throw new Error('Only needs_review recovery classifications may be persisted');
        }
        if (!input.subscriptionId || Number.isNaN(Date.parse(input.observedAt))) {
            throw new Error('Recovery review persistence requires an opaque Subscription ID and ISO observation time');
        }

        await this.db.prepare(`
            INSERT INTO subscription_recovery_reviews (subscription_id, classification, reason, observed_at)
            VALUES (?, 'needs_review', ?, ?)
            ON CONFLICT(subscription_id) DO UPDATE SET
                classification = excluded.classification,
                reason = excluded.reason,
                observed_at = excluded.observed_at
            WHERE subscription_recovery_reviews.classification IS NOT excluded.classification
               OR subscription_recovery_reviews.reason IS NOT excluded.reason
               OR subscription_recovery_reviews.observed_at IS NOT excluded.observed_at
        `).bind(input.subscriptionId, input.classification.reason, input.observedAt).run();

        const stored = await this.getNeedsReview(input.subscriptionId);
        if (!stored) throw new Error('Recovery review upsert could not be read back');
        return stored;
    }

    /** Read-only exact verification for a separately authorized persistence run. */
    async verifyNeedsReview(expected: RecoveryNeedsReviewRecord): Promise<boolean> {
        const actual = await this.getNeedsReview(expected.subscriptionId);
        return actual !== null
            && actual.classification === expected.classification
            && actual.reason === expected.reason
            && actual.observedAt === expected.observedAt;
    }

    /** Read-only lookup. Safe to use from a production audit or post-write verification. */
    async getNeedsReview(subscriptionId: string): Promise<RecoveryNeedsReviewRecord | null> {
        const row = await this.db.prepare(`
            SELECT subscription_id, classification, reason, observed_at
            FROM subscription_recovery_reviews
            WHERE subscription_id = ? AND classification = 'needs_review'
        `).bind(subscriptionId).first<StoredRecoveryNeedsReview>();
        return row ? recordFrom(row) : null;
    }
}

/** Persists and read-after-write verifies only explicit review blockers. */
export async function persistNeedsReviewClassifications(
    repository: D1ServiceCycleRecoveryReviewRepository,
    classifications: readonly RecoveryClassificationRecord[],
    observedAt: string,
): Promise<RecoveryNeedsReviewRecord[]> {
    const persisted: RecoveryNeedsReviewRecord[] = [];
    for (const row of classifications) {
        if (row.classification.status !== 'needs_review') continue;
        const record = await repository.upsertNeedsReview({
            subscriptionId: row.subscriptionId,
            classification: row.classification,
            observedAt,
        });
        if (!await repository.verifyNeedsReview(record)) {
            throw new Error(`Recovery review verification failed for Subscription ${row.subscriptionId}`);
        }
        persisted.push(record);
    }
    return persisted;
}
