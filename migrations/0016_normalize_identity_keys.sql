-- Normalize existing customer, lead, and address identity keys
-- This must run BEFORE the application code that relies on canonical keys.

-- 1. Emails: lowercase + trim
UPDATE customers SET email = lower(trim(email));
UPDATE leads     SET email = lower(trim(email)) WHERE email IS NOT NULL;

-- 2. Addresses: lowercase + trim
UPDATE addresses
SET raw_address = trim(lower(raw_address))
WHERE raw_address IS NOT NULL;

-- 3. Collapse runs of internal whitespace (idempotent: run twice for safety)
UPDATE addresses
SET raw_address = replace(raw_address, '  ', ' ')
WHERE raw_address LIKE '%  %';

UPDATE addresses
SET raw_address = replace(raw_address, '  ', ' ')
WHERE raw_address LIKE '%  %';

-- 4. Prevent future duplicate leads
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
