-- Fix spelling inconsistency: 'cancelled' -> 'canceled'
-- Stripe webhook was writing 'cancelled' (double L) but the admin UI and delete
-- endpoint check for 'canceled' (single L). This migration backfills existing rows.
UPDATE subscriptions SET status = 'canceled' WHERE status = 'cancelled';
