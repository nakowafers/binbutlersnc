-- Rebuild service_history without customer_id (was part of FK constraint)
CREATE TABLE service_history_new (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    service_date DATETIME NOT NULL,
    dispatch_status TEXT NOT NULL,
    sales_rep_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);
INSERT INTO service_history_new (id, subscription_id, service_date, dispatch_status, sales_rep_id, created_at)
SELECT id, subscription_id, service_date, dispatch_status, sales_rep_id, created_at FROM service_history;
DROP TABLE service_history;
ALTER TABLE service_history_new RENAME TO service_history;

-- Rebuild pending_dispatches without customer_id (was part of FK constraint)
CREATE TABLE pending_dispatches_new (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    service_date TEXT NOT NULL,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);
INSERT INTO pending_dispatches_new (id, subscription_id, service_date, retry_count, last_error, created_at)
SELECT id, subscription_id, service_date, retry_count, last_error, created_at FROM pending_dispatches;
DROP TABLE pending_dispatches;
ALTER TABLE pending_dispatches_new RENAME TO pending_dispatches;

-- Drop last_service_date from subscriptions (no FK constraint, standard DROP COLUMN works)
ALTER TABLE subscriptions DROP COLUMN last_service_date;
