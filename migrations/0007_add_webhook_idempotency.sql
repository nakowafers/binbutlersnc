-- Migration 0007: Add webhook idempotency table for Stripe at-least-once delivery
-- This enables safe duplicate event handling without data corruption

CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Cleanup old entries (keep 30 days)
-- This is a soft-indexed approach; cleanup can be done periodically
