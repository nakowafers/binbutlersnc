-- Normalize existing customer, lead, and address identity keys
-- This must run BEFORE the application code that relies on canonical keys.
--
-- WARNING: deduplication must happen BEFORE normalization to avoid
-- UNIQUE constraint violations after lowercase/trim collapses
-- previously case-different rows into true duplicates.

-- 0a. Deduplicate leads (keep converted over unconverted, then most recent)
DELETE FROM leads WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY lower(trim(email))
      ORDER BY converted DESC, created_at DESC
    ) AS rn FROM leads WHERE email IS NOT NULL
  ) WHERE rn = 1
);

-- 0b. Deduplicate addresses (prevent UNIQUE(raw_address, customer_id) violation)
DELETE FROM addresses WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY lower(trim(raw_address)), customer_id
      ORDER BY created_at DESC
    ) AS rn FROM addresses WHERE raw_address IS NOT NULL
  ) WHERE rn = 1
);

-- 0c. Deduplicate customers (safety net for case-different email duplicates)
DELETE FROM customers WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY lower(trim(email))
      ORDER BY created_at DESC
    ) AS rn FROM customers
  ) WHERE rn = 1
);

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
