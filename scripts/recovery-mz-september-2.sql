-- Approved M.Z. recovery. Execute only against the production D1 after the
-- exact read-only preflight and operator approval. Wrangler --file submits
-- these statements as one D1 batch transaction.

UPDATE subscriptions
SET service_cycle_anchor = '2026-08-26'
WHERE id = '11b81f41-cae8-4a93-a6de-f3cc899d5bfd'
  AND status = 'active'
  AND frequency_days = 28
  AND service_cycle_anchor IS NULL
  AND current_period_end = '2026-09-23T23:59:59.000Z'
  AND EXISTS (
    SELECT 1
    FROM customers c
    JOIN addresses a ON a.id = c.address_id
    WHERE c.id = customer_id AND a.service_day = 'WED'
  );

INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state)
SELECT
  'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-08-26',
  '11b81f41-cae8-4a93-a6de-f3cc899d5bfd',
  '2026-08-26',
  'open'
WHERE EXISTS (
    SELECT 1 FROM subscriptions
    WHERE id = '11b81f41-cae8-4a93-a6de-f3cc899d5bfd'
      AND status = 'active'
      AND frequency_days = 28
      AND service_cycle_anchor = '2026-08-26'
  )
  AND NOT EXISTS (
    SELECT 1 FROM service_cycles
    WHERE subscription_id = '11b81f41-cae8-4a93-a6de-f3cc899d5bfd'
      AND cycle_due_date = '2026-08-26'
  )
  AND NOT EXISTS (
    SELECT 1 FROM service_history
    WHERE subscription_id = '11b81f41-cae8-4a93-a6de-f3cc899d5bfd'
      AND cycle_due_date = '2026-08-26'
  );

INSERT INTO service_cycle_events (
  id, service_cycle_id, event_type, from_state, to_state,
  actor_id, actor_capacity, occurred_at, notes, correlation_key
)
SELECT
  'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-08-26:created',
  'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-08-26',
  'created', NULL, 'open', 'recovery-system', 'system',
  '2026-08-31T03:20:00.000Z', 'allowlisted_mz_catchup_recovery',
  'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-08-26'
WHERE EXISTS (
  SELECT 1 FROM service_cycles
  WHERE id = 'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-08-26'
);

INSERT INTO service_history (
  id, subscription_id, service_cycle_id, cycle_due_date,
  service_date, dispatch_status, completed_at
)
SELECT
  'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-09-02:attempt',
  '11b81f41-cae8-4a93-a6de-f3cc899d5bfd',
  'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-08-26',
  '2026-08-26', '2026-09-02', 'Pending', NULL
WHERE EXISTS (
  SELECT 1 FROM service_cycles
  WHERE id = 'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-08-26'
    AND state = 'open'
)
AND NOT EXISTS (
  SELECT 1 FROM service_history
  WHERE id = 'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-09-02:attempt'
);

INSERT INTO dispatch_stops (
  id, subscription_id, service_history_id, service_cycle_id,
  cycle_due_date, service_date, driver_sales_rep_id,
  route_sequence_order, dispatch_status, customer_name, raw_address,
  latitude, longitude, customer_phone
)
SELECT
  'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-09-02:stop',
  s.id,
  'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-09-02:attempt',
  'recovery:mz:11b81f41-cae8-4a93-a6de-f3cc899d5bfd:2026-08-26',
  '2026-08-26', '2026-09-02', 'eyanni', 1, 'assigned',
  COALESCE(c.name, NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), c.email),
  a.raw_address, a.latitude, a.longitude, c.phone_number
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
JOIN addresses a ON a.id = c.address_id
WHERE s.id = '11b81f41-cae8-4a93-a6de-f3cc899d5bfd'
  AND s.status = 'active'
  AND s.service_cycle_anchor = '2026-08-26'
  AND NOT EXISTS (
    SELECT 1 FROM dispatch_stops
    WHERE subscription_id = s.id AND service_date = '2026-09-02'
  );
