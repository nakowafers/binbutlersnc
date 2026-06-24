# Ubiquitous Language

## Onboarding & Leads

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Lead** | A prospective customer who has entered onboarding details but has not completed checkout. | Prospect, contact, draft customer |
| **D2D Onboarding** | A signup flow initiated in the field by a Sales Rep that creates an immediate completed service entry and bypasses weekly cron dispatching. | In-field signup, rep checkout, direct sale |
| **Organic Onboarding** | A self-service signup flow completed directly on the public website. | Self signup, web checkout, online boarding |
| **Sales Rep** | A field sales agent tracked by a unique rep identifier. | Canvasser, rep, direct agent |

## Operations & Routing

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Trash Day** | The weekly municipal or private waste collection day for a customer's address. | Pickup day, garbage day |
| **Service Day** | The day of the week a customer's bins are cleaned, automatically matched to their Trash Day. | Clean day, visit day |
| **Service Route** | A collection of optimized stops assigned to a driver for a specific day. | Run, driver path, dispatch route |
| **Routing Provider** | The external API integration used to manage and optimize stop sequences for dispatch. | Optimizer, dispatch service, route vendor |
| **Holiday Shift** | A manual 24-hour offset applied to weekly routes to accommodate holiday schedule changes. | Route shift, schedule offset, date delay |
| **Weekly Dispatch Cron** | An automated background task that identifies due subscribers and pushes their stops to the Routing Provider. | Weekly cron, dispatcher, route builder |

## Fulfillment & Service History

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Service Sticker** | A physical, weather-resistant label applied to a customer's bin during the initial clean for physical identification. | Bin tag, barcode, id label |
| **Service History** | The permanent record of past service attempts, including dates, statuses, and photos. | Clean history, job logs, visit history |
| **Verification Photo** | A geotagged proof-of-service image captured by a driver and stored in Cloudflare R2. | Proof photo, driver image, completion photo |

## Accounts & Billing

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Subscription** | An active, recurring agreement (monthly or quarterly) for bin cleaning services. | Plan, membership, contract |
| **Billing Portal** | A Stripe-hosted interface for managing payment methods, viewing invoices, and changing plans. | Account portal, customer dashboard |
| **Customer Portal** | A custom, passwordless authenticated dashboard for viewing service history and managing gate access notes or vacation mode. | Settings page, user profile |
| **Vacation Mode** | A customer-triggered settings state that pauses scheduled cleaning stops. | Service pause, holds, temporary pause |

## Relationships

* A **Customer** has exactly one **Address** and one **Subscription**.
* A **Subscription** belongs to exactly one **Customer**.
* An **Address** determines the customer's **Trash Day** and **Service Day**.
* A **Sales Rep** can initiate multiple **D2D Onboardings**.
* A **Weekly Dispatch Cron** generates **Service Routes** by pushing due **Subscriptions** to the **Routing Provider**.
* A **Service Route** consists of multiple stops, each mapped to a **Customer**.
* A completed stop in a **Service Route** adds a record to the **Service History** and requires a **Verification Photo** and a physical **Service Sticker** on the bin.
* A **Customer Portal** displays **Service History** and allows toggling **Vacation Mode**.
* A **Billing Portal** manages the financial aspect of the **Subscription**.

## Example dialogue

> **Dev:** "If a customer completes an **Organic Onboarding** on a Sunday, when is their first service?"
> **Domain expert:** "Their first cleaning is scheduled for their **Service Day** the following week. This is because the **Weekly Dispatch Cron** runs every Sunday at midnight to push stops to the **Routing Provider**."
> **Dev:** "What about a **D2D Onboarding**?"
> **Domain expert:** "A **D2D Onboarding** is sold in the field by a **Sales Rep**, and the driver fulfills it immediately on the spot. So we write a completed entry to their **Service History** immediately upon checkout rather than waiting for the next week's cron."
> **Dev:** "Got it. And how does the driver know which bin to clean during regular routes?"
> **Domain expert:** "The driver checks the bin for a **Service Sticker**. If it has an active sticker, they clean it and snap a **Verification Photo** to upload to the **Customer Portal**."
> **Dev:** "What if they toggle **Vacation Mode** in the **Customer Portal**?"
> **Domain expert:** "Then the **Weekly Dispatch Cron** ignores their **Subscription** for that week, so they won't appear on any **Service Route**."

## Flagged ambiguities

* **"Customer Portal" vs. "Billing Portal"**: These are frequently confused. The **Billing Portal** is Stripe-hosted and handles subscriptions, payment details, and invoices. The **Customer Portal** (or Settings Page) is custom-built and authenticated via Magic Link, handling vacation mode, gate notes, and service history/photos.
* **"Trash Day" vs. "Service Day"**: While representatively identical, **Trash Day** is the customer's waste pickup schedule, whereas **Service Day** is our scheduled dispatch day (linked to our route). The distinction is important for holiday shifting.
* **"Cancelled" vs. "Paused"**: A subscription can be **Cancelled** (service continues until the current period ends, then stops) or **Paused** via **Vacation Mode** (service is temporarily suspended but the subscription is not terminated).
