# ADR 0003: Service History Is Not a Scheduling Queue

## Status

Accepted

## Context

Future onboarding dates were represented by `Pending` Service History rows before a Service Route stop existed. A stale pending row can then block future dispatch generation, even when the Subscription is otherwise due.

## Decision

Use `subscriptions.next_service_date` only as the First Service Date selected during onboarding or through an admin Manual Reschedule. The Daily Dispatch Cron creates Service Route stops and pending Service History together when that exact service date is due, clears the consumed First Service Date after route creation, and existing orphan pending rows are audited as `needs_review` exceptions instead of being auto-repaired.

## Consequences

Service History remains the fulfillment ledger, not the scheduling queue. Missed First Service Dates and production repair are deliberate: an admin decides whether each orphan pending row represents completed service, owed makeup service, or bad data. The orphan pending audit is a developer-run script for this fix; it lists all orphan pending rows and flags which ones are currently route-blocking. A skipped first-service stop is recorded as skipped history; if it needs another attempt, an admin sets a new First Service Date instead of the system auto-retrying it. Broader recurring-service rescheduling and an admin exceptions UI are intentionally out of scope for this fix.
