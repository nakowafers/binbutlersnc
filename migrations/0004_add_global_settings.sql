-- Migration: Add global_settings table

CREATE TABLE global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initialize holiday offset
INSERT INTO global_settings (key, value) VALUES ('holiday_offset_hours', '0');
