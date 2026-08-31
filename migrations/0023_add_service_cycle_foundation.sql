-- Expand-only Service Cycle foundation. Legacy dispatch remains authoritative.
ALTER TABLE subscriptions ADD COLUMN service_cycle_anchor TEXT;

CREATE TABLE service_cycles (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    cycle_due_date TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('open', 'exception', 'fulfilled', 'waived')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
    UNIQUE(subscription_id, cycle_due_date)
);

ALTER TABLE service_history ADD COLUMN service_cycle_id TEXT REFERENCES service_cycles(id);
ALTER TABLE service_history ADD COLUMN cycle_due_date TEXT;
ALTER TABLE service_history ADD COLUMN completed_at TEXT;

ALTER TABLE dispatch_stops ADD COLUMN service_cycle_id TEXT REFERENCES service_cycles(id);
ALTER TABLE dispatch_stops ADD COLUMN cycle_due_date TEXT;

CREATE TABLE service_cycle_events (
    id TEXT PRIMARY KEY,
    service_cycle_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('created', 'transition', 'correction')),
    from_state TEXT CHECK(from_state IN ('open', 'exception', 'fulfilled', 'waived')),
    to_state TEXT NOT NULL CHECK(to_state IN ('open', 'exception', 'fulfilled', 'waived')),
    actor_id TEXT NOT NULL,
    actor_capacity TEXT NOT NULL CHECK(actor_capacity IN ('sales', 'fulfillment', 'administration', 'system')),
    occurred_at TEXT NOT NULL,
    reason TEXT CHECK(reason IN ('access_unavailable', 'bins_not_out', 'weather_or_holiday', 'billing_delinquency', 'vacation_pause', 'customer_request', 'operational_failure', 'data_integrity', 'other')),
    notes TEXT,
    correlation_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (service_cycle_id) REFERENCES service_cycles(id)
);

-- Prevent a stale writer from appending an event after another writer changed the cycle.
CREATE TRIGGER service_cycle_event_matches_current_state
BEFORE INSERT ON service_cycle_events
WHEN NEW.event_type IN ('transition', 'correction')
BEGIN
    SELECT CASE WHEN (SELECT state FROM service_cycles WHERE id = NEW.service_cycle_id) IS NOT NEW.to_state
        THEN RAISE(ABORT, 'Service Cycle event target does not match current state') END;
    SELECT CASE WHEN (SELECT to_state FROM service_cycle_events WHERE service_cycle_id = NEW.service_cycle_id ORDER BY rowid DESC LIMIT 1) IS NOT NEW.from_state
        THEN RAISE(ABORT, 'Service Cycle event source does not match latest event') END;
END;

CREATE TRIGGER service_cycle_events_are_append_only_on_update
BEFORE UPDATE ON service_cycle_events
BEGIN
    SELECT RAISE(ABORT, 'Service Cycle events are append-only');
END;

CREATE TRIGGER service_cycle_events_are_append_only_on_delete
BEFORE DELETE ON service_cycle_events
BEGIN
    SELECT RAISE(ABORT, 'Service Cycle events are append-only');
END;

CREATE INDEX idx_service_cycles_subscription_due_date ON service_cycles(subscription_id, cycle_due_date);
CREATE INDEX idx_service_cycle_events_cycle_occurred_at ON service_cycle_events(service_cycle_id, occurred_at);
CREATE INDEX idx_service_history_service_cycle ON service_history(service_cycle_id);
CREATE INDEX idx_dispatch_stops_service_cycle ON dispatch_stops(service_cycle_id);
