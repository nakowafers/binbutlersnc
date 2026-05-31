-- Migration 0008: Track Routific order IDs for subscription dispatches
-- Enables deleting pending Routific orders when payment fails

CREATE TABLE IF NOT EXISTS routific_dispatches (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    routific_order_id TEXT NOT NULL,
    service_date TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

CREATE INDEX idx_routific_dispatches_subscription ON routific_dispatches(subscription_id);
