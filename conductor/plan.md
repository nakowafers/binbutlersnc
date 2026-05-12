# Bin Butlers NC: Implementation Plan

## Objective
Finalize the architecture and begin implementation of the Bin Butlers NC serverless web application. All design decisions must adhere to `DESIGN.md`, and technical implementation must follow the patterns defined in `ARCHITECTURE.md`.

## Key Context & Business Logic
- **Reference Architecture (Jobatory):** The application is modeled after [Jobatory.com](https://www.jobatory.com/).
- **D2D Fulfillment:** Signup creates an immediate 'Completed' entry in `service_history`.
- **Bin Identification:** Drivers identify bins via physical **Service Stickers** applied by reps.
- **Holiday Handling:** Admin manually triggers route offsets (e.g., +24hrs) via the dashboard.
- **Geocoding:** Powered by Google Maps Platform (Autocomplete + Geocoding API).
- **Cancellation Policy:** "Service until end of period." The Weekly Cron checks the `current_period_end` date before dispatching.
- **UI & Styling:** Built using **Tailwind CSS** and **Shadcn UI**.
- **Auth Strategy:** **Magic Link (Passwordless)** login for the customer settings portal and Single Admin Dashboard via Auth.js.

## Implementation Steps

### Phase 1: Database & Backend Scaffolding
1. Update project rules officially establishing Jobatory CRM as the feature baseline.
2. Review and finalize `DESIGN.md` and `ARCHITECTURE.md`.
3. Initialize the Next.js project with Tailwind CSS and Shadcn UI.
4. Provision Cloudflare D1 and execute schema migrations (Leads, Addresses, Customers, Subscriptions, ServiceHistory).

### Phase 2: Stripe Integration & Checkout
1. Configure Stripe products and prices (Setup Fees + Recurring Tiers).
2. Build the `/api/checkout` endpoint to capture initial lead data and track `sales_rep_id`.
3. Implement the Stripe Webhook handler to sync state, mark leads as `converted`, and log the first D2D fulfillment.

### Phase 3: Routing Adapter & Weekly Cron
1. Implement the `IRoutingService` interface and `RoutificAdapter`.
2. Build the Weekly Dispatch Cron to push stops based on 4/12 week logic, respecting the `is_paused` flag and holiday offsets.
3. Build the Routific Webhook listener to log `service_history` completions and `photo_url`.

### Phase 4: Frontend & Admin UI
1. Migrate HTML/CSS to Next.js components using Shadcn UI.
2. Build the Onboarding flow and Authenticated Settings Page (Magic Link Auth).
3. Build the **Single-User Admin Dashboard** for route management and holiday shifting.

## Verification & Quality Assurance Strategy
Changes will be validated according to the **SQA-Grade Testing Matrix** defined in Section 9 of the `REQUIREMENTS.md`.

### Key Verification Milestones:
1. **Automated Logic Validation:** Pricing and scheduling logic will be unit-tested using Jest/Vitest.
2. **Webhook Simulation:** Stripe CLI and Mock Routific endpoints will be used to verify backend state transitions.
3. **Operational "Dry Runs":** The Weekly Dispatch Cron will be executed in "Dry Run" mode to verify stop selection logic before any live API calls.
4. **E2E Flow Checks:** Full manual and automated playthroughs of the Onboarding -> Payment -> Fulfillment lifecycle.
