-- Migration: Add Auth.js tables and update customers for auth

-- 1. Update customers to act as users
ALTER TABLE customers ADD COLUMN emailVerified DATETIME;
ALTER TABLE customers ADD COLUMN image TEXT;
ALTER TABLE customers ADD COLUMN role TEXT DEFAULT 'CUSTOMER' CHECK(role IN ('CUSTOMER', 'ADMIN'));

-- 2. Create accounts table
CREATE TABLE accounts (
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
    session_state TEXT,
    FOREIGN KEY (userId) REFERENCES customers(id) ON DELETE CASCADE
);

-- 3. Create sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    sessionToken TEXT NOT NULL UNIQUE,
    userId TEXT NOT NULL,
    expires DATETIME NOT NULL,
    FOREIGN KEY (userId) REFERENCES customers(id) ON DELETE CASCADE
);

-- 4. Create verification_tokens table
CREATE TABLE verification_tokens (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires DATETIME NOT NULL,
    PRIMARY KEY (identifier, token)
);

CREATE INDEX idx_accounts_userId ON accounts(userId);
CREATE INDEX idx_sessions_userId ON sessions(userId);
