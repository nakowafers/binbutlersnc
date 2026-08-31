# Service Cycle Invariant Enforcement

Ticket 12 adds only forward-looking D1 guards. It does not normalize legacy rows, delete compatibility columns, enable cutover, or authorize a production recovery write.

## Preflight and apply order

Run the local read-only preflight or print its SQL for local review:

```bash
npm run audit:service-cycle-invariants
npm run audit:service-cycle-invariants -- --print-sql
npm run audit:service-cycle-recovery -- --stripe-evidence ./fixtures/stripe-evidence.json
npm run audit:billing-drift -- --stripe-evidence ./fixtures/stripe-evidence.json
npm run audit:dispatch-parity -- --target 2026-09-29 --legacy-selection ./fixtures/legacy-selection.json
```

Every command opens only the local Miniflare SQLite database (or an explicit local `--db` file), is read-only by default, and permanently rejects `--apply`, remote targets, and production targets. The Stripe fixture is a JSON object keyed by Stripe Subscription ID; its values contain only status, billing/current-period timestamps, and recurring Price ID/cadence. `--stripe-live` is an optional read-only evidence lookup for the recovery and billing-drift audits and requires `STRIPE_LIVE_OPERATIONS_KEY`, a restricted read-only key. Deterministic audits use fixtures and never require Stripe access. Live evidence accepts only explicit configured Price IDs: current monthly/bi-monthly/quarterly and extra-bin IDs plus optional comma-separated `STRIPE_GRANDFATHERED_MONTHLY_PRICE_IDS`, `STRIPE_GRANDFATHERED_BIMONTHLY_PRICE_IDS`, and `STRIPE_GRANDFATHERED_QUARTERLY_PRICE_IDS`. A Price with a matching interval but no allowlist entry is rejected.

After reviewing the recovery inventory, persist only its `needs_review` classifications to that same local SQLite file with the explicit local-only flag:

```bash
npm run audit:service-cycle-recovery -- --stripe-evidence ./fixtures/stripe-evidence.json --persist-local-needs-review
```

This mode never writes verified anchors, Service Cycles, Service History, or Stripe. It upserts the PII-free Subscription ID, review reason, and observation time, then reads each row back for exact verification. Dispatch cutover consumes these persisted local review rows and suppresses guessed work. There is no remote or production persistence option.

The report is PII-free. It must have zero blocking findings and zero `recurring_anchor_review_required` rows before applying `0024_enforce_service_cycle_invariants.sql`. The latter requires a verified anchor or an explicit operational review decision that continues to suppress guessed recurring work.

Do not enable or retire `service_cycle_dispatch_cutover` based on this migration alone. The existing parity, recovery, and billing-audit gates remain the rollback switch because monitored production recovery has not been established by this code change. While the switch is disabled, legacy first-service, one-time, holiday-shift, Catch-Up, payment, and vacation behavior remains compatible.

## Rollback and repair

If the migration has not been applied, discard it. If it has been applied and a newly discovered legacy writer needs temporary compatibility, first disable the dispatch cutover setting, preserve all Service Cycle evidence, then use a separately reviewed inverse migration to drop only the Ticket 12 triggers and `service_history_one_completed_per_cycle` index. Never delete Service History, Service Cycles, or events to make a constraint pass. Correct records through the audited repair/recovery path, rerun the read-only preflight, and reapply the guards only after review.

## Service Day re-anchor repair

`/admin/service-day-reanchor` is an ADMIN-only, read-before-write repair for one active recurring Subscription. The preview reads the D1 service schedule and Stripe Subscription, displays the existing Service Day, Service Cycle Anchor, cadence, and Stripe current-period boundary, then requires an explicit reason and confirmation.

This is an audited **service-schedule** re-anchor, not a Stripe billing re-anchor: it must not set `billing_cycle_anchor`, change a Price, quantity, cadence, invoice timing, or amount. Stripe metadata is updated only after the existing billing boundary agrees with D1; D1 then uses compare-and-set writes and append-only cycle evidence. If D1 fails, the operation performs and verifies the inverse Stripe metadata repair. Any stale preview, Stripe/D1 mismatch, missing future cycle, failed verification, or inverse-repair failure stops the operation without guessing or rewriting historical cycles.
