-- Migration: Add pending_dispatches for retry queue

CREATE TABLE pending_dispatches (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    service_date TEXT NOT NULL, -- The date it SHOULD have been dispatched
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

CREATE INDEX idx_pending_dispatches_retry ON pending_dispatches(retry_count);
