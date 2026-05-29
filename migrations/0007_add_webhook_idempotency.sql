-- Migration 0007: Add webhook idempotency table for Stripe at-least-once delivery
-- This enables safe duplicate event handling without data corruption

CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Index for periodic cleanup queries on created_at
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);
