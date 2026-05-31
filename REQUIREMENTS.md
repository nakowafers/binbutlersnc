# Bin Butlers NC: Product Requirements Document (PRD)

**Version:** 1.0.0  
**Role:** Lead Solutions Architect / Senior SQA Engineer II  
**Status:** Draft for Implementation  

---

## 1. Project Overview & Goals
Bin Butlers NC is a specialized local service application providing professional trash bin cleaning. The goal is to provide a seamless, serverless automated experience for customer onboarding, billing management, and route dispatching.

### Core Objectives:
*   **Zero-Admin Onboarding:** Automate the transition from website visitor to scheduled customer.
*   **Operational Efficiency:** Leverage geographic route optimization to minimize drive time.
*   **Self-Service Billing:** Reduce overhead by utilizing Stripe's native customer management tools.
*   **Data Integrity:** Maintain a vendor-agnostic "Single Source of Truth" for service history and routing data.

---

## 2. System Architecture & Tech Stack
The application follows a **Serverless-First** philosophy for scalability and low operational cost.

*   **Frontend & Hosting:** Next.js (App Router) deployed via **Cloudflare Pages**.
*   **UI Framework:** **Tailwind CSS** with **Shadcn UI** components.
*   **Backend Logic:** Next.js Edge API Routes deployed via `@cloudflare/next-on-pages`.
*   **Database:** **Cloudflare D1** (Serverless SQLite) for relational storage.
*   **Payments & Subscriptions:** **Stripe** (Dynamic Checkout Sessions, Customer Portal, and Webhooks).
*   **Authentication:** **Auth.js (NextAuth)** utilizing Passwordless Magic Links for the custom settings portal.
*   **Route Optimization:** **Routific API** for fleet dispatch.
*   **Communications (Future):** Resend or SendGrid for transactional notifications and abandoned cart emails.
---

## 3. Design Patterns & Modularity

### Design & UX Methodology (Stitch Integration)
To ensure high-fidelity UI and professional user flows, all designs must be iteratively refined using **Stitch**.
- **Prompt Engineering:** Use Stitch to enhance design prompts, ensuring UI elements are optimized for the trash bin cleaning industry.
- **Screen Generation:** Leverage Stitch to produce consistent, responsive screens and flows that align with the reference architecture (Jobatory).
- **Component Standard:** All generated designs must be implemented using **Next.js**, **Tailwind CSS**, and **Shadcn UI**.

### The Adapter Pattern (Routing)
...

To avoid vendor lock-in with Routific, the system must implement a strict **Adapter Pattern** for the routing layer.

#### Interface Definition (`IRoutingService`):
The core business logic will interact with a generic interface:
- `pushTarget(customerData)`: Standardizes the payload for adding a stop.
- `updateTarget(customerData)`: Standardizes updates to location or metadata.
- `deleteTarget(externalId)`: Removes a stop from the active route.
- `getDispatchStatus(externalId)`: Retrieves real-time status from the provider.

#### Implementation:
- `RoutificAdapter`: Implements `IRoutingService` by mapping generic calls to Routific-specific API endpoints and authentication.
- **Benefit:** If the business switches to OptimoRoute or Circuit, only the Adapter class requires modification; the webhook handlers and database logic remain untouched.

### Database Naming Conventions:
Column names in D1 must be generic to support the Adapter Pattern:
- Use `external_routing_provider_id` instead of `routific_id`.
- Use `dispatch_status` instead of `routific_status`.

---

## 4. Functional Requirements

### 4.1. Customer Discovery & Onboarding
1.  **Signup Origination (D2D vs Organic):** 
    - **D2D Signups:** Onboarding URLs will support a `?rep=REP_ID` parameter. The system captures this ID. The first clean is fulfilled immediately on the spot by the rep.
    - **Organic Signups:** Customers are automatically scheduled to start the **following week** to allow for operational dispatching.
    - **One-Time Organic:** Dispatched exactly once on the following week's route.
2.  **Address & Service Details (Onboarding Fields):**
    - **Physical Address:** Geocoded and validated (Google Maps).
    - **Phone Number:** **Required** for SMS reminders and account recovery.
    - **Gate Code / HOA Name / Access Notes:** Optional fields for entry.
    - **Trash Day:** Required dropdown.
    - **Provider:** Required dropdown: ["Town", "Private", "Other" (with text entry)].
3.  **Abandoned Cart Recovery (Future):** The system will persist the customer's `email`, `address`, and `rep_id` to a `leads` table *before* redirecting to Stripe. If a successful `checkout.session.completed` webhook is not received within 24 hours, the system triggers an automated follow-up.

### 4.2. Checkout & Provisioning
1.  **Dynamic Stripe Checkout:** The backend generates a dynamic session where the `Setup Fee` defaults to $100 flat regardless of bin count. This is the only fee due at signing. For subscriptions, a trial period is applied (28 days for monthly, 84 days for quarterly) so that the recurring flat rate starts only after the initial cleaning interval. D2D sales reps have the ability to manually edit this initial fee for on-the-spot sales, but the fee cannot be less than $0.
2.  **Service Day Logic:** The system automatically assigns `service_day = trash_day`. Bins are cleaned on the same day as garbage collection.
3.  **Route Assignment:** Maps address to `service_route_id` based on the assigned `service_day`.

### 4.3. Dispatch & Automation (Weekly Cron Strategy)
1.  **Stop Management:** The system uses a **Weekly Dispatch Cron** to identify "due" customers.
2.  **Execution:** Every Sunday at 00:00 UTC, the system:
    - Queries D1 for customers due (4/12 week intervals).
    - Pushes active stops to the Routing Provider.
3.  **Holiday Rescheduling (Manual Offset):** The Admin Dashboard will include a "Shift Routes" feature to manually offset a week's service dates (e.g., shifting all Tuesday stops to Wednesday) to accommodate municipal holiday schedules.

### 4.4. Client & Admin Management
1.  **Stripe Billing Portal:** Post-checkout, users are redirected directly to Stripe's hosted Billing Portal for self-service payment management, invoices, and plan changes — no custom auth required.
2.  **Authenticated Settings Page (Future):** Magic-Link login for users to update address/day, toggle "Vacation Mode," view service history, and manage property access details.
3.  **Bin Identification:** Service relies on physical "Service Stickers" applied during the initial D2D clean. Drivers clean all bins marked with active stickers.
4.  **Admin Dashboard (Single User):** A secure administrative view for:
    - Reviewing new signups and mapping them to routes.
    - Manually triggering holiday route shifts.
    - Viewing `service_history` and `sales_rep` performance.
    - Handling manual refunds via Stripe redirect.

### 4.5. Driver Operations & Exception Handling
1.  **Execution:** Drivers use the Routific Mobile App for navigation and job completion.
2.  **Service Verification (Photos):** Drivers capture proof-of-service photos which are uploaded to **Cloudflare R2** and linked in the customer portal.
3.  **Missed/Skipped Stops:** If a stop is marked as 'skipped' or 'missed' (e.g., bins not left out), the system logs the status and automatically reschedules the customer for the **following week**, overriding their standard Monthly/Quarterly recurrence interval for that specific cycle.

---

## 5. Backend & API Requirements

### 5.1. Stripe Webhook Handler (`/api/webhooks/stripe`)
- **Event:** `checkout.session.completed`
- **Action:** 
    1. Capture `sales_rep_id` from metadata.
    2. Persist `bin_quantity` and `customer` details to D1.
    3. **D2D Fulfillment:** If `sales_rep_id` is present, immediately create a record in `service_history` with `dispatch_status = 'completed'` and `service_date = NOW()`.
    4. **Contract Delivery:** Trigger an automated email via Resend containing a copy of the agreed-upon Terms of Service.
    5. Calculate the first scheduled cleaning date for the dispatch cron.
- **Event:** `customer.subscription.deleted`
- **Action:** Update `status = 'cancelled'` in D1. Note: Service continues until the `current_period_end` stored in D1/Stripe.

### 5.2. Routing Webhook Listener (`/api/webhooks/routing`)
- **Action:** 
    1. Verify payload signature.
    2. Identify customer via `external_routing_id`.
    3. Write entry to `service_history` table (Timestamp, Status: Completed, Photo URL).

---

## 6. Database Schema (Cloudflare D1)

### Table: `leads`
- `id` (UUID, PK)
- `email` (String)
- `address` (String)
- `sales_rep_id` (String)
- `created_at` (Timestamp)
- `converted` (Boolean)

### Table: `addresses`
- `id` (UUID, PK)
- `raw_address` (String)
- `latitude` (Float)
- `longitude` (Float)
- `trash_day` (Enum: MON-FRI)
- `service_day` (Enum: MON-FRI) -- Assigned as the same day as Trash Day.
- `provider_name` (String)
- `gate_code` (String, Optional)
- `hoa_name` (String, Optional)
- `access_notes` (Text, Optional)

### Table: `customers`
- `id` (UUID, PK)
- `stripe_customer_id` (String, Indexed)
- `email` (String)
- `phone_number` (String)
- `address_id` (FK -> addresses.id)
- `bin_quantity` (Integer)
- `sales_rep_id` (String, Optional)
- `tos_accepted_at` (Timestamp, Optional)
- `external_routing_id` (String)

### Table: `subscriptions`
- `id` (UUID, PK)
- `customer_id` (FK)
- `stripe_subscription_id` (String)
- `status` (String)
- `tier` (String)
- `current_period_end` (Timestamp)
- `is_paused` (Boolean, Default: false)

### Table: `service_history`
- `id` (UUID, PK)
- `customer_id` (FK)
- `service_date` (Timestamp)
- `dispatch_status` (String)
- `sales_rep_id` (String)

---

## 7. Edge Cases & QA Considerations

### 7.1. Address & Routing Failures
- **Scenario:** Address is valid but outside the service boundary or cannot be geocoded by the routing provider.
- **Requirement:** System must flag "Manual Review Required" in D1 and notify the admin, while still allowing the payment to proceed (or triggering a refund flow).

### 7.2. Payment Failures
- **Scenario:** `invoice.payment_failed` webhook received.
- **Requirement:** System must immediately invoke `RoutingService.deleteTarget()` to stop service until payment is resolved.

### 7.3. API Timeouts
- **Scenario:** Cloudflare Worker fails to connect to Routific during onboarding.
- **Requirement:** Implement an **Idempotent Retry Queue**. Store the pending routing task in D1 and use a Cloudflare Cron Trigger to retry every 15 minutes until success.

### 7.4. Manual Overrides
- **Scenario:** Customer changes their trash day with the city.
- **Requirement:** Admin dashboard must allow manual re-mapping of a customer to a different `service_route_id` without breaking the Stripe connection.

---

## 8. Implementation Prerequisites (API Keys Required)
To initialize the project, the following external credentials must be provisioned:
- **Cloudflare:** Account ID and D1 Database ID.
- **Stripe:** Secret Key, Webhook Secret, and Price IDs.
- **Google Maps Platform:** API Key (Places Autocomplete & Geocoding).
- **Routific:** API Key.

---

## 9. Verification & Quality Assurance Strategy
Every feature must be verified against the following SQA-grade testing matrix before being marked as "Complete."

### 9.1. Unit Testing (Core Logic)
- **Pricing Engine:** Verify the $100 flat fee for initial cleans (including custom overrides for D2D reps) and that recurring charges are deferred by the appropriate interval (4 or 12 weeks).
- **Scheduling Engine:** Validate 4-week and 12-week interval calculations.
- **Date Offsets:** Verify "Trash Day = Service Day" logic and "Holiday Shift" (+24h) calculations.

### 9.2. Integration Testing (APIs & Webhooks)
- **Stripe Webhook Simulator:** Use the Stripe CLI to trigger `checkout.session.completed` and verify D1 record creation and `service_history` logging.
- **Routific Adapter Validation:** Mock the Routific API to ensure the generic `IRoutingService` correctly maps data to the `RoutificAdapter`.
- **D1 Transactional Integrity:** Verify that failures in API calls (e.g., Routific timeout) do not leave the database in an inconsistent state (using the Retry Queue).

### 9.3. End-to-End (E2E) Testing
- **D2D Onboarding Flow:** Complete a signup with a `?rep=john` parameter and verify the customer is NOT pushed to the weekly cron for their first clean.
- **Organic Onboarding Flow:** Complete a signup without a `rep_id` and verify the customer IS pushed to the next available route.
- **Auth Flow:** Verify Magic Link generation, delivery (logged in dev), and successful session establishment on the Settings Page.

### 9.4. Operational Validation
- **Cron Simulation:** Manually trigger the Weekly Dispatch Worker in a staging environment and verify it identifies exactly the correct subset of "Due" customers.
- **Holiday Shift Test:** Trigger a shift on a test route and verify the `service_date` updates in the dispatch payload.

### 9.5. Security & Privacy
- **Authenticated Routes:** Verify that the Admin Dashboard and Settings Page return 401/403 for unauthenticated or incorrectly scoped sessions.
- **PII Protection:** Ensure no sensitive customer data is logged to Cloudflare logs or external monitoring tools.

---

## 10. Future Features

### 10.1. Custom Customer Portal
Replace the Stripe Billing Portal redirect with an authenticated, self-hosted portal featuring:

- **Service History:** Display past cleanings with dates, addresses, and dispatch status, linked to proof-of-service photos from Cloudflare R2.
- **Service Details Management:** Self-serve updates to gate code, HOA name, and access notes.
- **Reschedule:** Allow customers to change their service day.
- **Vacation Mode (Pause/Resume):** Temporarily pause subscription service.
- **Stripe Billing Actions:** Manage payment methods, invoices, and plan changes (via embedded or linked Stripe components).

### 10.2. Notifications & Communications
- **Transactional Emails:** Service reminders, confirmations, and receipts via Resend.
- **Abandoned Cart Recovery:** Automated follow-up for leads that don't complete checkout within 24 hours.
- **SMS Reminders:** Day-before service alerts with provider details.

### 10.3. Admin Dashboard Enhancements
- **Route Shifting:** Holiday schedule offset tool to shift a week's stops (e.g., Tuesday → Wednesday).
- **Manual Re-mapping:** Reassign a customer to a different service route without breaking the Stripe connection.
- **Refund Flow:** Trigger refunds via Stripe redirect from the admin panel.

## 11. Future Migrations

### 11.1. Adapter Migration: `@cloudflare/next-on-pages` → `@opennextjs/cloudflare`

**Status:** Planned (not yet scheduled)

**Rationale:**
`@cloudflare/next-on-pages` is [deprecated](https://github.com/cloudflare/next-on-pages#readme). It only supports the Next.js Edge runtime, which lacks ISR, full Node.js API compatibility, and modern Next.js features. The recommended replacement is `@opennextjs/cloudflare`, which runs on the Node.js runtime within Cloudflare Workers and supports the full Next.js feature set.

**Impact Summary:**

| Change | Files Affected |
|---|---|
| Replace package dependency | `package.json` |
| Replace `getRequestContext` → `getCloudflareContext` | 10 source files |
| Update `wrangler.toml` paths (`.vercel/output` → `.open-next/`) | `wrangler.toml` |
| Update `next.config.mjs` dev platform setup | `next.config.mjs` |
| Update `package.json` build scripts | `package.json` |
| Remove `export const runtime = 'edge'` from routes | ~5 route files |
| Update test mocks | 5 test files |
| Update CI build command | `.github/workflows/deploy.yml` |
| Add `open-next.config.ts` | New file |
| Add `.open-next/` to `.gitignore` | `.gitignore` |

**Key Differences After Migration:**

| Capability | Before (`next-on-pages`) | After (`@opennextjs/cloudflare`) |
|---|---|---|
| Runtime | Edge (constrained Node.js) | Node.js via `nodejs_compat` |
| ISR | Static fallback only | Full support |
| Server Actions | Partial | Full |
| `next/image` optimization | Limited | Via Cloudflare Images |
| Build output | `.vercel/output/static/` | `.open-next/` |
| Deploy command | `wrangler pages deploy` | `wrangler deploy` |

**No architecture change** — the app remains a single Cloudflare Worker with Assets (no split into Pages + Workers required).

---

**Approval Signature:**  
*Lead Architect: ____________________*  
*QA Lead: __________________________*
