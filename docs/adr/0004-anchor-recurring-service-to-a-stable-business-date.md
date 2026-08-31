# Anchor recurring service to a stable business date

Status: accepted

Recurring cleaning and billing are anchored to a stable Eastern Service Cycle Anchor on a 28-, 56-, or 84-day cadence. Service Date records when work actually occurred, Completed At records when fulfillment was attested, and Stripe invoice or payment timing does not move the service cycle.

Catch-Up Service resolves missed work without shifting future normal service dates. A payment problem can create a cycle-specific Billing-Related Service Exception, but retries and delayed successful payments do not silently re-anchor service. D2D Onboarding creates immediate completed Service History only when cleaning genuinely occurs during the field sale; otherwise the customer follows scheduled onboarding.

For D2D Onboarding, the immediate cleaning is outside the normal recurring cycle. The Service Cycle Anchor is the first configured Service Day on or after one cadence has elapsed from that cleaning. Every fulfillment record identifies both its actual Service Date and the Cycle Due Date it satisfies, allowing late Catch-Up Service to preserve the original recurring cycle.

Historical timestamp normalization is automatic only when conversion to an Eastern Service Date is unambiguous and collision-free. Midnight boundaries, linked-route mismatches, duplicate normalized dates, and contradictory evidence are classified for review instead of guessed.

This rejects the previous rolling model based on the latest completed timestamp because late fulfillment could move service away from the customer's trash day and Stripe billing cycle. Explicit administrative re-anchoring remains possible as a separate deliberate operation.

The initial production recovery schedules Mary Zima's September 2 Catch-Up Service against the missed August 26 cycle while retaining September 23 as her next normal cycle, protects M.B.'s August 31 normal route, and retains September 28 as A.S.'s first normal Monday cycle after confirming the August 27 field cleaning. No recovery marks service completed without operational evidence.

## Persistence

The service cycle is explicit state rather than a value silently derived from Stripe or the latest completion. Subscriptions persist a Service Cycle Anchor; Service History and Service Route stops persist their Cycle Due Date; Service History persists Completed At separately from Service Date. Normal service has matching Cycle Due Date and Service Date, while Catch-Up Service preserves the missed Cycle Due Date and records the later actual Service Date. Related route and history writes remain atomic.

After historical data is clean, the database enforces canonical service dates. A preflight must stop on malformed values, normalized collisions, route/history disagreement, or contradictory evidence instead of coercing them.

## Delivery and recovery gates

Delivery is separated into a core invariant change, an audited production recovery, and follow-up work for UTC admin defaults, cleanup boundaries, orphan-upsert behavior, and a broader recurring-service exceptions UI. Billing Portal plan switching remains out of scope.

Production recovery requires focused recurrence tests, the full test suite, lint, build, local migration and seed simulation, a read-only production allowlist, staging cron simulations, and post-deployment SELECT verification before customer data is changed.

## Existing subscriptions and exceptions

Existing anchors are migrated only when Stripe's billing-cycle anchor and recurring Price cadence agree with the configured Service Day, D1 period data, and fulfillment chronology. Latest completion alone is not authoritative. Any disagreement is classified for review.

Each Subscription and Cycle Due Date identifies one Service Cycle obligation. A cycle may contain multiple Service Attempts but no more than one successful completion. Skipped work, invalid payment coverage, and other unresolved outcomes create a reviewable Service Exception; payment events and later evidence can make Catch-Up Service appropriate, but an admin approves the date rather than the system generating retroactive work automatically.

Administrative re-anchoring is a separate coordinated Stripe-and-D1 operation. It validates Service Day, displays old and proposed dates, records actor and reason, fails closed on partial synchronization, and never rewrites historical Service Cycles. It is outside the initial recovery UI.

## Cycle authority and payment timing

Service Cycle is persisted as an authoritative obligation with one row per Subscription and Cycle Due Date. Service Attempts in Service History and Dispatch Stops reference it. The cycle owns fulfillment and exception state, while attempt records preserve each assigned, completed, or skipped outcome.

Prior-evening dispatch requires an active Subscription with no unresolved prior delinquency; it does not wait for successful payment on the upcoming Billing Cycle Date. A same-day payment failure does not silently remove an assigned stop. It creates a Billing-Related Service Exception for review and can affect future service without shifting the cycle.

## Confirmed initial recovery

Mary Zima was not serviced on August 26 and has agreed to September 2 Catch-Up Service for that missed cycle. September 2 remains planned work until fulfillment is attested; it must not be recorded as completed in advance. Her next normal cycle remains September 23.

M.B.'s August 31 route must be verified and the customer notified only if prevention fails. A.S.'s August 27 field cleaning must be confirmed before finalizing September 28 as the first normal recurring anchor.

## Service Cycle states

A Service Cycle is `open` while service is owed, `exception` while an operational or billing issue requires review, `fulfilled` after one successful attempt, or `waived` when an admin resolves the obligation without service and records a reason. Open cycles can become exceptions or fulfilled; exceptions can return to open for approved Catch-Up Service, become fulfilled, or be waived. Fulfilled and waived cycles are terminal except through separately audited data correction.

Attempt assignment and skipping do not themselves close a Service Cycle. The cycle transition and the successful attempt are persisted atomically so an obligation cannot be fulfilled twice.

## Time-sensitive fallback

The complete fix may deploy before M.B.'s August 31 route only if every recovery gate passes. Otherwise an idempotent, explicitly allowlisted fallback creates only M.B.'s August 31 normal Service Cycle, assigned stop, and Pending Service History atomically. It does not normalize unrelated data or bypass verification. Fulfillment records August 31 only after actual service is attested and does not move the established cycle.

## Rollout

The schema rolls out through expand, migrate, and contract phases because production migrations run before new application code. An additive migration introduces the Service Cycle model and nullable references; compatible code begins writing it without changing legacy scheduling; read-only parity reports compare both eligibility models; verified anchors and cycles are backfilled; dispatch switches only after parity is clean; strict constraints and legacy removal occur in later deployments.

Every production mutation uses an explicit allowlist, records before-state and expected counts, and has a precomputed inverse repair. Identity or count mismatches stop the rollout.

## Completion evidence

Completion requires canonical Service Dates, a verified anchor or explicit review classification for every active recurring Subscription, unique Subscription and Cycle Due Date obligations, at most one successful attempt per cycle, and eligibility parity for automatically migrated subscriptions. Production logs expose cycle creation, exception creation, Catch-Up approval, duplicate prevention, and malformed-date rejection without customer PII.

Mary must have an open September 2 Catch-Up attempt for the August 26 cycle while retaining September 23 as the next normal cycle. M.B. must have an August 31 normal route. A.S. requires confirmation of August 27 service before September 28 is finalized. The production audit repeats after the next normal cron and after Mary's September 2 fulfillment.

## Operational boundaries

A Holiday Shift changes the actual Service Date of an attempt while retaining the normal Cycle Due Date and Service Cycle Anchor. It is planned shifted service, not Catch-Up Service.

Vacation Mode suppresses route creation without automatically creating Catch-Up Service. Cycles with ambiguous billing or service treatment are reviewed; coordinated Stripe billing pause, waiver, and resume re-anchoring remain a separate feature.

Cancellation permits normal cycles whose Cycle Due Date is before paid-through coverage ends. It prevents later cycles but does not erase an existing open or exception obligation.

One-time service uses one Service Cycle with no recurring anchor. Its selected date is the Cycle Due Date, and skipped attempts require explicit Catch-Up approval without creating recurring work.

A Service Day change requires the audited re-anchor operation. It coordinates Stripe at an agreed period boundary, preserves historical cycles, and cannot take effect through a direct address edit.

## Temporal authority and attestation

Actual Service Date is the current Eastern calendar date with no booking cutoff. Earliest Bookable Date applies the onboarding cutoff, and Dispatch Target Date is the next Eastern date selected by cron. These concepts are not interchangeable.

D2D completion requires successful Checkout plus an explicit Sales Rep attestation containing the actual Eastern Service Date. Sales Rep identity and webhook-processing time do not prove fulfillment. Service performed without successful Checkout becomes a manual sales/payment exception instead of completed history for a nonexistent Subscription.

Billing alignment promises a Billing Cycle Date, not an exact invoice, payment-attempt, or successful-payment time. New subscriptions use a consistent anchor instant on that Eastern date; existing anchor times remain unchanged unless deliberately re-anchored. Same-day payment completion is not a dispatch prerequisite.

Relevant Stripe webhooks and a scheduled read-only audit check Price mapping, cadence, anchor weekday, and event ordering against D1. Drift becomes an alert and review classification; it never silently rewrites Service Cycles or Service History.

## Exceptions and audit

Service Exceptions use controlled reasons: `access_unavailable`, `bins_not_out`, `weather_or_holiday`, `billing_delinquency`, `vacation_pause`, `customer_request`, `operational_failure`, `data_integrity`, and `other`. Notes are optional except for `other`, every waiver, and every data correction.

Current Service Cycle state is paired with an append-only event trail recording the cycle, transition, actor, timestamp, reason, notes, and correlation or idempotency key. Production corrections append evidence and use a repair ledger rather than deleting history.

The current business has one Operator acting in sales, fulfillment, and administrative capacities. Audit events record one Operator identity plus the capacity used for each action; the design does not impose artificial separation of people but preserves enough provenance for future role separation.
