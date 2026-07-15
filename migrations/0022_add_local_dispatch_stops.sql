ALTER TABLE sales_reps ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS dispatch_stops (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    service_history_id TEXT NOT NULL,
    service_date TEXT NOT NULL,
    driver_sales_rep_id TEXT NOT NULL,
    route_sequence_order INTEGER NOT NULL DEFAULT 0,
    dispatch_status TEXT NOT NULL DEFAULT 'assigned' CHECK(dispatch_status IN ('assigned', 'completed', 'skipped')),
    customer_name TEXT,
    raw_address TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    bin_count INTEGER NOT NULL DEFAULT 1,
    customer_scent TEXT,
    service_notes TEXT,
    customer_phone TEXT,
    skip_reason TEXT,
    completed_at TEXT,
    updated_by_sales_rep_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
    FOREIGN KEY (service_history_id) REFERENCES service_history(id),
    UNIQUE(subscription_id, service_date)
);

CREATE INDEX idx_dispatch_stops_driver_date_status
    ON dispatch_stops(driver_sales_rep_id, service_date, dispatch_status, route_sequence_order);

CREATE INDEX idx_dispatch_stops_service_history
    ON dispatch_stops(service_history_id);
