CREATE TABLE IF NOT EXISTS sales_reps (
    id TEXT PRIMARY KEY,
    can_override_fee INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
