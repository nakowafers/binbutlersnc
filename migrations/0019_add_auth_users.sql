-- Auth users table for non-customer authenticated users (e.g. sales reps, staff)
-- Keeps Auth.js user records separate from the customers table so admin users
-- never appear in customer-facing views.
CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    emailVerified DATETIME,
    image TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
