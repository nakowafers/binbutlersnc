-- Initial schema migration for Bin Butlers NC

CREATE TABLE leads (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    raw_address TEXT NOT NULL,
    sales_rep_id TEXT,
    converted BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT UNIQUE,
    rep_id TEXT, -- Persisted from lead capture
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE addresses (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    raw_address TEXT NOT NULL,
    standardized_address TEXT,
    lat REAL,
    lng REAL,
    service_day TEXT, -- e.g., 'Monday'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    UNIQUE(raw_address, customer_id)
);

CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL, -- 'active', 'canceled', 'incomplete', etc.
    current_period_end DATETIME,
    is_paused BOOLEAN DEFAULT FALSE,
    last_service_date DATETIME,
    frequency_days INTEGER NOT NULL, -- 28 or 84
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE service_history (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    service_date DATETIME NOT NULL,
    status TEXT NOT NULL, -- 'Completed', 'Scheduled', 'Failed'
    photo_url TEXT,
    rep_id TEXT, -- Sales rep or Driver ID
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

CREATE INDEX idx_service_history_customer_date ON service_history(customer_id, service_date);
CREATE INDEX idx_subscriptions_status_paused ON subscriptions(status, is_paused);
