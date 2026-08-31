# Context: Bin Butlers NC Domain Model

## Onboarding & Leads

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Lead** | A prospective customer who has entered onboarding details but has not completed checkout. | Prospect, contact, draft customer |
| **D2D Onboarding** | A signup flow initiated by a Sales Rep only when the customer's first cleaning is completed during the field sale. If cleaning does not occur during the sale, the customer follows scheduled onboarding instead. | In-field signup, rep checkout, direct sale |
| **Organic Onboarding** | A self-service signup flow completed directly on the public website. | Self signup, web checkout, online boarding |
| **Sales Rep** | The sales capacity in which an Operator conducts field onboarding. It does not imply a different person from the Admin-Driver or admin. | Canvasser, separate sales user, direct agent |

## Operations & Routing

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Trash Day** | The weekly municipal or private waste collection day for a customer's address. | Pickup day, garbage day |
| **Service Day** | The day of the week a customer's bins are cleaned, automatically matched to their Trash Day. | Clean day, visit day |
| **Operator** | The authenticated person performing sales, fulfillment, or administrative work. Each action records the capacity in which the Operator acted even when one person performs every capacity. | Separate user per role, generic actor, staff account |
| **Admin-Driver** | The fulfillment capacity in which an Operator performs Service Route work. It does not imply a different person from the Sales Rep or admin. | Separate driver user, route user |
| **Service Route** | A local D1-backed ordered set of dispatch stops assigned to an Admin-Driver for one service date. | Run, driver path, dispatch route |
| **Route Optimizer** | The in-app route ordering component used to sequence local dispatch stops. | Routing provider, route vendor |
| **Holiday Shift** | A planned offset that moves a Service Attempt to another Service Date without changing its Cycle Due Date or the Service Cycle Anchor. | Catch-up service, cycle reset, billing shift |
| **Daily Dispatch Cron** | An automated background task that identifies subscriptions due for the next Eastern service date and creates local Service Routes. | Dispatcher, route builder |
| **Earliest Bookable Date** | The earliest date onboarding may schedule after applying the Eastern booking cutoff. It is not evidence of when service occurred. | Actual service date, dispatch date, today |
| **Dispatch Target Date** | The Eastern Service Date for which the Daily Dispatch Cron is currently planning routes. | UTC cron date, billing date, current date |
| **First Service Date** | The initial scheduled cleaning date selected during onboarding. After that service is fulfilled, recurring schedule eligibility comes from completed Service History and the Subscription frequency. | Next service date, appointment date |
| **Service Cycle Anchor** | The first normal recurring Service Date that establishes a Subscription's 4-, 8-, or 12-week cycle. For D2D Onboarding, it is the first configured Service Day on or after one cadence has elapsed from the immediate cleaning. | Latest completion date, charge timestamp, rolling anchor |
| **Service Cycle** | One recurring cleaning obligation for a Subscription, identified by its Cycle Due Date. It may require multiple Service Attempts but can have at most one successful completion. | Billing cycle, route stop, service-history row |
| **Catch-Up Service** | An owed cleaning performed outside its normal recurring Service Date. It resolves missed work without shifting the Service Cycle Anchor. | Makeup cycle, rescheduled subscription, new cycle |
| **Service Exception** | A reviewable unresolved Service Cycle that was not normally fulfilled because of payment coverage, access, weather, skipped work, or contradictory operational evidence. | Automatic retry, failed subscription, new cycle |
| **Manual Reschedule** | An admin action that sets a new First Service Date for a customer whose initial service needs to be attempted again. In this model it is limited to first-service problems, not general recurring route management, and follows the same date rules as onboarding first-service scheduling. | Retry, auto-reschedule, makeup route |

## Fulfillment & Service History

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Service Sticker** | A physical, weather-resistant label applied to a customer's bin during the initial clean for physical identification. | Bin tag, barcode, id label |
| **Service History** | The permanent record of past service attempts, including dates, statuses, and photos. | Clean history, job logs, visit history |
| **Service Date** | The Eastern calendar date on which a cleaning was actually performed or attempted. It is distinct from the time when fulfillment was recorded. | Completion timestamp, submission time, billing date |
| **Cycle Due Date** | The normal recurring Service Date whose obligation a service attempt satisfies. For Catch-Up Service, it remains the missed cycle date even when the Service Date is later. | Catch-up date, completion date, billing timestamp |
| **Service Attempt** | One assigned, completed, or skipped attempt to satisfy a Service Cycle. Multiple attempts may belong to the same cycle, but only one may be completed successfully. | Service cycle, billing cycle, retry |
| **Completed At** | The instant when an Admin-Driver recorded a completed cleaning. It does not determine the Service Date or recurring cycle. | Service date, cleaning day |
| **D2D Service Attestation** | A Sales Rep's explicit assertion that the initial cleaning occurred on the stated Eastern Service Date. A Sales Rep identifier by itself is not an attestation. | Sales rep ID, checkout timestamp, webhook time |
| **Orphan Pending Service History** | An invalid scheduling placeholder where a pending Service History entry exists without a corresponding Service Route stop. It requires human review before repair and should not be treated as normal route work by default. | Unrouted job, pending route, scheduled history |
| **Verification Photo** | A geotagged proof-of-service image captured by an Admin-Driver and stored in Cloudflare R2. | Proof photo, driver image, completion photo |

## Accounts & Billing

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Subscription** | An active, recurring agreement for bin cleaning services. | Plan, membership, contract |
| **Billing Cycle Date** | The Stripe billing-cycle date associated with a recurring Subscription. Invoice creation, payment attempts, and successful payment can occur at different times without moving the Service Cycle Anchor. | Charge timestamp, payment date |
| **Billing-Related Service Exception** | A cycle-specific decision to withhold or review service because paid-through coverage is not valid. It does not silently re-anchor future service. | Automatic cancellation, cycle reset |
| **Monthly Subscription** | The customer-named Subscription billed and serviced every 4 weeks (28 days), not by calendar month. | Calendar-month plan, 30-day plan |
| **Bi-Monthly Subscription** | The customer-named Subscription billed and serviced every 8 weeks (56 days), not by calendar months. | Bimonthly plan, two-calendar-month plan |
| **Quarterly Subscription** | A Subscription serviced and renewed every 12 weeks, not by calendar quarter. | Calendar-quarter plan, 13-week plan |
| **Billing Portal** | A Stripe-hosted interface for managing payment methods, viewing invoices, and cancellation. Subscription plan switching is temporarily disabled until local cadence synchronization exists. | Account portal, customer dashboard |
| **Customer Portal** | A custom, passwordless authenticated dashboard for viewing service history and managing gate access notes or vacation mode. | Settings page, user profile |
| **Vacation Mode** | A customer-triggered request to suppress scheduled cleaning while active. Coordinated billing, cycle waiver, and resume behavior remain unsupported until explicitly designed. | Billing pause, automatic catch-up, cycle reset |

## Relationships

* A **Customer** has exactly one **Address** and one **Subscription**.
* A **Subscription** belongs to exactly one **Customer**.
* An **Address** determines the customer's **Trash Day** and **Service Day**.
* A **Sales Rep** can initiate multiple **D2D Onboardings**.
* One **Operator** may act in sales, fulfillment, and administrative capacities; recorded actions retain the applicable capacity.
* The **Daily Dispatch Cron** generates local **Service Routes** from due **Subscriptions**.
* A **Service Route** consists of multiple stops, each mapped to a **Customer**.
* A completed stop in a v1 **Service Route** is an **Admin-Driver** attestation that updates **Service History**.
* A **Service Cycle** may have multiple **Service Attempts** but at most one successful completion.
* A **Holiday Shift** changes an attempt's **Service Date**, not its **Cycle Due Date** or **Service Cycle Anchor**.
* A one-time cleaning has one **Service Cycle** and no **Service Cycle Anchor**.
* A future proof-of-service workflow may require a **Verification Photo** and a physical **Service Sticker** on the bin.
* A **Customer Portal** displays **Service History** and allows toggling **Vacation Mode**.
* A **Billing Portal** manages the financial aspect of the **Subscription**.

## Example dialogue

> **Dev:** "If a customer completes an **Organic Onboarding** on a Sunday, when is their first service?"
> **Domain expert:** "Their first cleaning is scheduled for their next eligible **Service Day**. The **Daily Dispatch Cron** runs each prior Eastern evening and creates a local **Service Route** for the next Eastern service date."
> **Dev:** "What about a **D2D Onboarding**?"
> **Domain expert:** "A **D2D Onboarding** is sold in the field by a **Sales Rep**, and the Admin-Driver fulfills it immediately on the spot. So we write a completed entry to their **Service History** immediately upon checkout rather than waiting for scheduled dispatch."
> **Dev:** "Got it. And how does the Admin-Driver know which bin to clean during regular routes?"
> **Domain expert:** "The Admin-Driver checks the bin for a **Service Sticker**. If it has an active sticker, they clean it and snap a **Verification Photo** to upload to the **Customer Portal**."
> **Dev:** "What if they toggle **Vacation Mode** in the **Customer Portal**?"
> **Domain expert:** "Then the **Daily Dispatch Cron** skips their **Subscription** while vacation mode applies, so they won't appear on any **Service Route** for that service date."
