-- Ticket 12 is intentionally additive. Apply only after the read-only
-- service-cycle invariant preflight reports no blocking findings. Existing
-- timestamp-shaped legacy rows are preserved; these triggers validate new
-- dates and explicit date changes only.

CREATE TRIGGER service_cycle_anchor_is_canonical_on_insert
BEFORE INSERT ON subscriptions
WHEN NEW.service_cycle_anchor IS NOT NULL
 AND (NEW.service_cycle_anchor NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      OR date(NEW.service_cycle_anchor, '+0 days') IS NOT NEW.service_cycle_anchor)
BEGIN
    SELECT RAISE(ABORT, 'service_cycle_invalid_date: subscriptions.service_cycle_anchor');
END;

CREATE TRIGGER service_cycle_anchor_is_canonical_on_update
BEFORE UPDATE OF service_cycle_anchor ON subscriptions
WHEN NEW.service_cycle_anchor IS NOT NULL
 AND (NEW.service_cycle_anchor NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      OR date(NEW.service_cycle_anchor, '+0 days') IS NOT NEW.service_cycle_anchor)
BEGIN
    SELECT RAISE(ABORT, 'service_cycle_invalid_date: subscriptions.service_cycle_anchor');
END;

CREATE TRIGGER service_cycles_due_date_is_canonical
BEFORE INSERT ON service_cycles
WHEN NEW.cycle_due_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
 OR date(NEW.cycle_due_date, '+0 days') IS NOT NEW.cycle_due_date
BEGIN
    SELECT RAISE(ABORT, 'service_cycle_invalid_date: service_cycles.cycle_due_date');
END;

CREATE TRIGGER service_cycles_due_date_is_canonical_on_update
BEFORE UPDATE OF cycle_due_date ON service_cycles
WHEN NEW.cycle_due_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
 OR date(NEW.cycle_due_date, '+0 days') IS NOT NEW.cycle_due_date
BEGIN
    SELECT RAISE(ABORT, 'service_cycle_invalid_date: service_cycles.cycle_due_date');
END;

CREATE TRIGGER service_history_dates_are_canonical_on_insert
BEFORE INSERT ON service_history
WHEN (NEW.service_cycle_id IS NOT NULL OR NEW.cycle_due_date IS NOT NULL)
 AND (NEW.service_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
 OR date(NEW.service_date, '+0 days') IS NOT NEW.service_date
 OR (NEW.cycle_due_date IS NOT NULL AND (NEW.cycle_due_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
     OR date(NEW.cycle_due_date, '+0 days') IS NOT NEW.cycle_due_date)))
BEGIN
    SELECT RAISE(ABORT, 'service_cycle_invalid_date: service_history');
END;

CREATE TRIGGER service_history_dates_are_canonical_on_update
BEFORE UPDATE OF service_date, cycle_due_date, service_cycle_id ON service_history
WHEN (NEW.service_cycle_id IS NOT NULL OR NEW.cycle_due_date IS NOT NULL)
 AND (NEW.service_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
 OR date(NEW.service_date, '+0 days') IS NOT NEW.service_date
 OR (NEW.cycle_due_date IS NOT NULL AND (NEW.cycle_due_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
     OR date(NEW.cycle_due_date, '+0 days') IS NOT NEW.cycle_due_date)))
BEGIN
    SELECT RAISE(ABORT, 'service_cycle_invalid_date: service_history');
END;

CREATE TRIGGER dispatch_stop_dates_are_canonical_on_insert
BEFORE INSERT ON dispatch_stops
WHEN NEW.service_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
 OR date(NEW.service_date, '+0 days') IS NOT NEW.service_date
 OR (NEW.cycle_due_date IS NOT NULL AND (NEW.cycle_due_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
     OR date(NEW.cycle_due_date, '+0 days') IS NOT NEW.cycle_due_date))
BEGIN
    SELECT RAISE(ABORT, 'service_cycle_invalid_date: dispatch_stops');
END;

CREATE TRIGGER dispatch_stop_dates_are_canonical_on_update
BEFORE UPDATE OF service_date, cycle_due_date ON dispatch_stops
WHEN NEW.service_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
 OR date(NEW.service_date, '+0 days') IS NOT NEW.service_date
 OR (NEW.cycle_due_date IS NOT NULL AND (NEW.cycle_due_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
     OR date(NEW.cycle_due_date, '+0 days') IS NOT NEW.cycle_due_date))
BEGIN
    SELECT RAISE(ABORT, 'service_cycle_invalid_date: dispatch_stops');
END;

-- This index makes a second successful fulfillment of one Service Cycle
-- impossible while retaining multiple Pending/Skipped attempts for Catch-Up.
CREATE UNIQUE INDEX service_history_one_completed_per_cycle
    ON service_history(service_cycle_id)
    WHERE service_cycle_id IS NOT NULL AND dispatch_status = 'Completed';
