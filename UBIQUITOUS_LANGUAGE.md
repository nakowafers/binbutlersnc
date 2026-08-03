# Ubiquitous Language

## Onboarding & Leads

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Lead** | A prospective customer who has entered onboarding details but has not completed checkout. | Prospect, contact, draft customer |
| **D2D Onboarding** | A signup flow initiated in the field by a Sales Rep that creates an immediate completed service entry and bypasses scheduled dispatch. | In-field signup, rep checkout, direct sale |
| **Organic Onboarding** | A self-service signup flow completed directly on the public website. | Self signup, web checkout, online boarding |
| **Sales Rep** | A field sales agent tracked by a unique rep identifier. | Canvasser, rep, direct agent |

## Operations & Routing

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Trash Day** | The weekly municipal or private waste collection day for a customer's address. | Pickup day, garbage day |
| **Service Day** | The day of the week a customer's bins are cleaned, automatically matched to their Trash Day. | Clean day, visit day |
| **Admin-Driver** | An admin user who performs route fulfillment in v1. | Driver role, route user |
| **Service Route** | A local D1-backed ordered set of dispatch stops assigned to an Admin-Driver for one service date. | Run, driver path, dispatch route |
| **Route Optimizer** | The in-app route ordering component used to sequence local dispatch stops. | Routing provider, route vendor |
| **Holiday Shift** | A manual 24-hour offset applied to service dates to accommodate holiday schedule changes. | Route shift, schedule offset, date delay |
| **Daily Dispatch Cron** | An automated background task that identifies subscriptions due for the next Eastern service date and creates local Service Routes. | Dispatcher, route builder |

## Fulfillment & Service History

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Service Sticker** | A physical, weather-resistant label applied to a customer's bin during the initial clean for physical identification. | Bin tag, barcode, id label |
| **Service History** | The permanent record of past service attempts, including dates, statuses, and photos. | Clean history, job logs, visit history |
| **Verification Photo** | A geotagged proof-of-service image captured by an Admin-Driver and stored in Cloudflare R2. | Proof photo, driver image, completion photo |

## Accounts & Billing

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Subscription** | An active, recurring agreement (monthly or quarterly) for bin cleaning services. | Plan, membership, contract |
| **Quarterly Subscription** | A Subscription serviced and renewed every 12 weeks, not by calendar quarter. | Calendar-quarter plan, 13-week plan |
| **Billing Portal** | A Stripe-hosted interface for managing payment methods, viewing invoices, and changing plans. | Account portal, customer dashboard |
| **Customer Portal** | A custom, passwordless authenticated dashboard for viewing service history and managing gate access notes or vacation mode. | Settings page, user profile |
| **Vacation Mode** | A customer-triggered settings state that pauses scheduled cleaning stops. | Service pause, holds, temporary pause |

## Relationships

* A **Customer** has exactly one **Address** and one **Subscription**.
* A **Subscription** belongs to exactly one **Customer**.
* An **Address** determines the customer's **Trash Day** and **Service Day**.
* A **Sales Rep** can initiate multiple **D2D Onboardings**.
* The **Daily Dispatch Cron** generates local **Service Routes** from due **Subscriptions**.
* A **Service Route** consists of multiple stops, each mapped to a **Customer**.
* A completed stop in a v1 **Service Route** is an **Admin-Driver** attestation that updates **Service History**.
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

## Flagged ambiguities

* **"Customer Portal" vs. "Billing Portal"**: These are frequently confused. The **Billing Portal** is Stripe-hosted and handles subscriptions, payment details, and invoices. The **Customer Portal** (or Settings Page) is custom-built and authenticated via Magic Link, handling vacation mode, gate notes, and service history/photos.
* **"Trash Day" vs. "Service Day"**: While representatively identical, **Trash Day** is the customer's waste pickup schedule, whereas **Service Day** is our scheduled dispatch day (linked to our route). The distinction is important for holiday shifting.
* **"Cancelled" vs. "Paused"**: A subscription can be **Cancelled** (service continues until the current period ends, then stops) or **Paused** via **Vacation Mode** (service is temporarily suspended but the subscription is not terminated).
