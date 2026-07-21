# 0001 Local Dispatch Routing

## Status

Accepted

## Context

The app had Routific-specific dispatch code, but Routific was not tested or used operationally. The v1 route experience needs to be available inside the current Cloudflare/Next.js application without paid container hosting.

VROOM remains a good future candidate for full vehicle routing, but it requires a hosted C++/container process or equivalent service boundary. That is outside the v1 cost and operations constraints.

## Decision

Use local D1-backed dispatch stops as the operational source of truth for Service Routes. Generate route sequence order with an in-app TypeScript geographic optimizer for v1, and keep the optimizer behind a small interface so VROOM can replace it later.

## Consequences

The v1 route order is a reasonable geographic ordering, not full vehicle routing. It does not support time windows, capacities, driver skills, breaks, traffic, or multi-vehicle assignment.

The app no longer needs Routific runtime calls to generate route work. Service history remains the permanent fulfillment ledger, while dispatch stops represent active route work and driver actions.
