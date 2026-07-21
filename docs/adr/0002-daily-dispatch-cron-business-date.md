# ADR 0002: Daily Dispatch Cron Business Date

## Status

Accepted

## Context

Cloudflare cron triggers are configured in UTC. Bin Butlers NC dispatch work is planned around Eastern service dates, and the local dispatch implementation stores D1-backed dispatch stops for Admin-Driver fulfillment.

The worker is scheduled as `0 0 * * *`, which runs at `00:00 UTC`. In Eastern time, that is the prior evening for the next local service date.

## Decision

Keep the Cloudflare cron schedule at `00:00 UTC`.

Interpret dispatch service dates in `America/New_York`.

The Daily Dispatch Cron intentionally runs the prior Eastern evening and creates Service Routes for the next Eastern service date.

## Consequences

Service Route dates are business dates, not UTC calendar dates.

The cron remains daily and local-primary: it creates local D1-backed dispatch stops for Admin-Driver fulfillment. It does not require a separate driver role or a Routing Provider.

Holiday shifts apply as local service-date offsets after the next Eastern service date is chosen.
