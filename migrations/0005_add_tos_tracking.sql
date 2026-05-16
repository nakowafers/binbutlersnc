-- Add tos_accepted_at to leads and customers tables
ALTER TABLE leads ADD COLUMN tos_accepted_at TIMESTAMP;
ALTER TABLE customers ADD COLUMN tos_accepted_at TIMESTAMP;
