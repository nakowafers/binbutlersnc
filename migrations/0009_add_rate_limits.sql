-- Migration 0009: Rate limiting table for auth endpoints
-- Token-bucket style rate limiting using D1

CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
