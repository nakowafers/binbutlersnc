# Orphan Pending Service History Audit

This read-only report lists `Pending` Service History rows that are not linked to a Dispatch Stop. It is for human review only; it does not repair, complete, skip, delete, or create route work.

`route_blocking` is scoped to the supplied target Service Date. It is `1` when the orphan belongs to an active, unpaused Subscription on that Service Day, there is no Dispatch Stop for the Subscription on that target date, and the Subscription is first-service due for that exact date or recurring due.

## Local D1

Start Wrangler or the app once so the local D1 SQLite file exists, then run:

```bash
npm run report:orphan-pending-service-history -- --target-service-date 2026-07-22
```

Use JSON output when saving evidence:

```bash
npm run report:orphan-pending-service-history -- --target-service-date 2026-07-22 --format json
```

To point at a specific local D1 SQLite file:

```bash
npm run report:orphan-pending-service-history -- --db .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<database>.sqlite --target-service-date 2026-07-22
```

## Remote D1

Print the read-only SQL, review it, then execute it with Wrangler against the remote database:

```bash
npm run report:orphan-pending-service-history -- --target-service-date 2026-07-22 --print-sql
npx wrangler d1 execute binbutlersnc-db --remote --command "<paste reviewed SELECT statement>"
```

The generated SQL is a `WITH ... SELECT` statement only.
