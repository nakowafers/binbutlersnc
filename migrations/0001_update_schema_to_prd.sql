-- Migration: Align schema with PRD Section 6

-- 1. Update 'leads' table
ALTER TABLE leads RENAME COLUMN raw_address TO address;

-- 2. Update 'addresses' table
-- Note: SQLite does not support removing columns easily.
-- We will add the missing columns.
ALTER TABLE addresses RENAME COLUMN lat TO latitude;
ALTER TABLE addresses RENAME COLUMN lng TO longitude;
ALTER TABLE addresses ADD COLUMN trash_day TEXT CHECK(trash_day IN ('MON', 'TUE', 'WED', 'THU', 'FRI'));
ALTER TABLE addresses ADD COLUMN provider_name TEXT;
ALTER TABLE addresses ADD COLUMN gate_code TEXT;
ALTER TABLE addresses ADD COLUMN hoa_name TEXT;
ALTER TABLE addresses ADD COLUMN access_notes TEXT;

-- 3. Update 'customers' table
ALTER TABLE customers ADD COLUMN phone_number TEXT;
ALTER TABLE customers ADD COLUMN address_id TEXT REFERENCES addresses(id);
ALTER TABLE customers ADD COLUMN bin_quantity INTEGER;
ALTER TABLE customers RENAME COLUMN rep_id TO sales_rep_id;
ALTER TABLE customers ADD COLUMN external_routing_id TEXT;

-- 4. Update 'subscriptions' table
ALTER TABLE subscriptions ADD COLUMN tier TEXT;

-- 5. Update 'service_history' table
ALTER TABLE service_history RENAME COLUMN status TO dispatch_status;
ALTER TABLE service_history RENAME COLUMN rep_id TO sales_rep_id;

-- 6. Add indexes for performance as per ARCHITECTURE
CREATE INDEX IF NOT EXISTS idx_customers_stripe_id ON customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
