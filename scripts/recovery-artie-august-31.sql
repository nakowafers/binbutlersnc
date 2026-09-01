-- Approved Artie Swinton first-service recovery. Execute only after the exact
-- read-only preflight and operator approval. This preserves the orphaned
-- August 27 history row and creates the actual August 31 route work.

UPDATE subscriptions
SET next_service_date = '2026-08-31'
WHERE id = 'd33c2750-b508-4422-8a51-ae4863312ac7'
  AND status = 'active'
  AND frequency_days = 28
  AND next_service_date IS NULL
  AND service_cycle_anchor IS NULL
  AND current_period_end = '2026-09-28T23:59:59.000Z';

INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state)
SELECT
  'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31',
  'd33c2750-b508-4422-8a51-ae4863312ac7',
  '2026-08-31',
  'open'
WHERE EXISTS (
    SELECT 1 FROM subscriptions
    WHERE id = 'd33c2750-b508-4422-8a51-ae4863312ac7'
      AND status = 'active'
      AND next_service_date = '2026-08-31'
  )
  AND NOT EXISTS (
    SELECT 1 FROM service_cycles
    WHERE subscription_id = 'd33c2750-b508-4422-8a51-ae4863312ac7'
      AND cycle_due_date = '2026-08-31'
  )
  AND NOT EXISTS (
    SELECT 1 FROM service_history
    WHERE subscription_id = 'd33c2750-b508-4422-8a51-ae4863312ac7'
      AND service_date = '2026-08-31'
  )
  AND NOT EXISTS (
    SELECT 1 FROM dispatch_stops
    WHERE subscription_id = 'd33c2750-b508-4422-8a51-ae4863312ac7'
      AND service_date = '2026-08-31'
  );

INSERT INTO service_cycle_events (
  id, service_cycle_id, event_type, from_state, to_state,
  actor_id, actor_capacity, occurred_at, reason, notes, correlation_key
)
SELECT
  'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31:created',
  'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31',
  'created', NULL, 'open', 'recovery-system', 'system',
  '2026-08-31T15:28:25.000Z',
  'data_integrity',
  'Created after next_service_date was omitted at signup; prior August 27 history retained for audit.',
  'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31'
WHERE EXISTS (
  SELECT 1 FROM service_cycles
  WHERE id = 'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31'
);

INSERT INTO service_history (
  id, subscription_id, service_cycle_id, cycle_due_date,
  service_date, dispatch_status, completed_at
)
SELECT
  'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31:attempt',
  'd33c2750-b508-4422-8a51-ae4863312ac7',
  'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31',
  '2026-08-31', '2026-08-31', 'Pending', NULL
WHERE EXISTS (
  SELECT 1 FROM service_cycles
  WHERE id = 'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31'
    AND state = 'open'
)
AND NOT EXISTS (
  SELECT 1 FROM service_history
  WHERE id = 'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31:attempt'
);

INSERT INTO dispatch_stops (
  id, subscription_id, service_history_id, service_cycle_id,
  cycle_due_date, service_date, driver_sales_rep_id,
  route_sequence_order, dispatch_status, customer_name, raw_address,
  latitude, longitude, customer_phone
)
SELECT
  'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31:stop',
  s.id,
  'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31:attempt',
  'recovery:artie-swinton:d33c2750-b508-4422-8a51-ae4863312ac7:2026-08-31',
  '2026-08-31', '2026-08-31', 'eyanni', 4, 'assigned',
  COALESCE(c.name, NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), c.email),
  a.raw_address, a.latitude, a.longitude, c.phone_number
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
JOIN addresses a ON a.id = c.address_id
JOIN sales_reps r ON r.id = 'eyanni' AND r.is_admin = 1 AND COALESCE(r.is_active, 1) = 1
WHERE s.id = 'd33c2750-b508-4422-8a51-ae4863312ac7'
  AND s.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM dispatch_stops
    WHERE subscription_id = s.id AND service_date = '2026-08-31'
  );
