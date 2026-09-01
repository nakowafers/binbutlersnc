-- Append-only evidence for existing-subscription bin quantity adjustments.
-- This table intentionally has no customer/subscription foreign keys so audit
-- evidence remains readable if an account is later removed.
CREATE TABLE billing_adjustment_audit (
    audit_id TEXT PRIMARY KEY,
    correlation_key TEXT NOT NULL UNIQUE,
    customer_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    stripe_subscription_id TEXT,
    stripe_item_id TEXT NOT NULL,
    stripe_price_id TEXT NOT NULL,
    before_total_bins INTEGER NOT NULL CHECK(before_total_bins >= 0),
    target_total_bins INTEGER NOT NULL CHECK(target_total_bins >= 0),
    before_extra_bin_quantity INTEGER NOT NULL CHECK(before_extra_bin_quantity >= 0),
    target_extra_bin_quantity INTEGER NOT NULL CHECK(target_extra_bin_quantity >= 0),
    operator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    completed_at TEXT,
    outcome TEXT NOT NULL CHECK(outcome IN ('applied', 'no_change', 'failed', 'rolled_back', 'recovery_required')),
    recovery_classification TEXT CHECK(recovery_classification IS NULL OR recovery_classification IN (
        'stripe_update_failed', 'stripe_rollback_failed', 'compare_and_set_conflict', 'invalid_state'
    )),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_billing_adjustment_audit_customer
    ON billing_adjustment_audit(customer_id, requested_at);

CREATE INDEX idx_billing_adjustment_audit_subscription
    ON billing_adjustment_audit(subscription_id, requested_at);

CREATE TRIGGER billing_adjustment_audit_no_update
BEFORE UPDATE ON billing_adjustment_audit
BEGIN
    SELECT RAISE(ABORT, 'Billing adjustment audit is append-only');
END;

CREATE TRIGGER billing_adjustment_audit_no_delete
BEFORE DELETE ON billing_adjustment_audit
BEGIN
    SELECT RAISE(ABORT, 'Billing adjustment audit is append-only');
END;
