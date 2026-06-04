-- Add first_name and last_name to leads and customers
-- The existing `name` column on customers remains the source of truth
-- for NextAuth's users view + triggers; application code keeps it
-- in sync as `first_name || ' ' || last_name`.

ALTER TABLE customers ADD COLUMN first_name TEXT;
ALTER TABLE customers ADD COLUMN last_name TEXT;
ALTER TABLE leads ADD COLUMN first_name TEXT;
ALTER TABLE leads ADD COLUMN last_name TEXT;
