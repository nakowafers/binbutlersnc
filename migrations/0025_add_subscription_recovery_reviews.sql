-- PII-free recovery audit ledger. This does not change billing, dispatch,
-- fulfillment history, or service-cycle anchors.
CREATE TABLE subscription_recovery_reviews (
    subscription_id TEXT PRIMARY KEY,
    classification TEXT NOT NULL CHECK(classification = 'needs_review'),
    reason TEXT NOT NULL CHECK(reason IN (
        'missing_stripe_evidence', 'unknown_price', 'missing_anchor', 'midnight_boundary',
        'weekday_mismatch', 'cadence_mismatch', 'period_mismatch', 'route_history_disagreement',
        'completion_chronology_conflict', 'normalized_collision', 'duplicate_completion',
        'contradictory_evidence', 'stripe_status_mismatch'
    )),
    observed_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

CREATE INDEX idx_subscription_recovery_reviews_reason
    ON subscription_recovery_reviews(reason);
