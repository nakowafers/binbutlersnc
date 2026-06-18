-- Remove foreign key constraints from accounts and sessions tables
-- These previously referenced customers(id) but users can now exist in auth_users too.
-- The application handles referential integrity; FK constraints are too restrictive.

-- Recreate accounts without foreign key
CREATE TABLE IF NOT EXISTS accounts_new (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    providerAccountId TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT
);
INSERT INTO accounts_new SELECT * FROM accounts;
DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;
CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);

-- Recreate sessions without foreign key
CREATE TABLE IF NOT EXISTS sessions_new (
    id TEXT PRIMARY KEY,
    sessionToken TEXT NOT NULL UNIQUE,
    userId TEXT NOT NULL,
    expires DATETIME NOT NULL
);
INSERT INTO sessions_new SELECT * FROM sessions;
DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;
CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
