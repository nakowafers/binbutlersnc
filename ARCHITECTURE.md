# Bin Butlers NC: Technical Architecture & Implementation Guide

## 1. Unified Tech Stack (Serverless Edge)
The application is built on a high-performance, low-latency stack optimized for the **Cloudflare Ecosystem**.

*   **Framework:** Next.js 14+ (App Router).
*   **Runtime:** **Cloudflare Pages (Edge Runtime)** via `@cloudflare/next-on-pages`.
*   **Database:** **Cloudflare D1** (Serverless SQLite).
*   **Storage:** **Cloudflare R2** (S3-Compatible) for images.
*   **Payments:** **Stripe** (Checkout Sessions & Webhooks).
*   **Routing:** **Routific API** (External).
*   **Auth:** **Auth.js** (NextAuth) with Magic Link provider.

## 2. Core Implementation Patterns

### 2.1. The Routing Adapter (Vendor Agnosticism)
All interactions with the routing provider must pass through the `IRoutingService` interface.
- **Location:** `src/lib/routing/`
- **Implementation:** `RoutificAdapter.ts` maps generic calls to Routific's `/jobs` or `/projects` endpoints.
- **Mandate:** Never import Routific-specific libraries directly into API routes or Webhook handlers.

### 2.2. The Weekly Dispatch Cron (State-Driven)
A Cloudflare Scheduled Worker (Cron) runs every Sunday at 00:00 UTC.
- **Logic:**
    1. Select all `subscriptions` where `status = 'active'` and `is_paused = false`.
    2. Filter for those where `current_period_end > NOW()`.
    3. Calculate "Due" status based on `last_service_date` + frequency (28/84 days).
    4. Push the resulting payload to the Routing Service.
- **Retry Queue:** Use a `pending_dispatches` table in D1 to handle Routific API timeouts/failures.

### 2.3. Stripe Webhook Synchronization
The `/api/webhooks/stripe` endpoint is the authoritative source for customer status.
- **Lead Capture:** `/api/checkout` writes to the `leads` table before redirecting.
- **Conversion:** `checkout.session.completed` moves data from `leads` -> `customers` & `addresses`.
- **D2D Fulfillment:** Captures `rep_id` from metadata to immediately log a "Completed" service record.

## 3. Database Schema Mapping (D1)
Relational integrity is enforced via SQL constraints in D1.

*   **Addresses Table:** Unique constrained by `raw_address` + `customer_id`.
*   **Service History Table:** Indexed by `customer_id` and `service_date` for fast portal lookups.
*   **ToS Acceptance:** `tos_accepted_at` timestamp persisted in `leads` and `customers` to track contract agreement.
*   **Sales Rep Tracking:** `rep_id` string persisted across `customers` and `service_history` for performance querying.

## 4. Frontend Component Architecture
*   **UI Library:** Shadcn UI (Radix Primitives).
*   **Styling:** Utility-first Tailwind CSS.
*   **State Management:** React Server Components (RSC) for data fetching, `useForm` (React Hook Form) + `Zod` for onboarding validation.

## 5. Deployment Workflow
1.  **Local Dev:** Use `wrangler pages dev` to simulate the Edge environment.
2.  **Migrations:** Use `wrangler d1 migrations` for all schema changes.
3.  **Secrets:** Managed via Cloudflare Pages environment variables (`STRIPE_SECRET`, `GOOGLE_MAPS_KEY`, etc.).

## 6. SQA Verification Protocol
Every architectural component must have a corresponding test case in the `tests/` directory:
- `tests/unit/pricing.test.ts`
- `tests/integration/stripe-webhook.test.ts`
- `tests/e2e/onboarding.spec.ts` (Playwright)
