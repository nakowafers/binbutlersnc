# Fix: D2D Fulfillment Logic in Webhook

## Objective
Update the Stripe `checkout.session.completed` webhook to correctly differentiate between D2D and Organic signups when logging the initial `service_history` record.

## Scope
- `src/app/api/webhooks/stripe/route.ts`: Modify the D1 batch transaction.

## Problem
Currently, the webhook indiscriminately creates a "Completed" service history record for *every* successful checkout. If a `sales_rep_id` is missing (an organic signup), it defaults to assigning the rep ID as `'SYSTEM'`.
This violates the PRD logic where organic signups should NOT receive an immediate completed record, so they can be picked up by the routing scheduler for their first real clean.

## Implementation Steps
1. In `src/app/api/webhooks/stripe/route.ts`, extract the `batchStatements` array from the `env.DB.batch()` call.
2. Add a conditional check: `if (salesRepId) { ... }`.
3. Only push the `INSERT INTO service_history` statement to the batch array if `salesRepId` is truthy.
4. Execute `await env.DB.batch(batchStatements)`.