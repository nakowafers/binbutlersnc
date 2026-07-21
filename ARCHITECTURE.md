# Bin Butlers NC: Technical Architecture & Implementation Guide

## 1. Unified Tech Stack (Serverless Edge)
The application is built on a high-performance, low-latency stack optimized for the **Cloudflare Ecosystem**.

*   **Framework:** Next.js 14+ (App Router).
*   **Runtime:** **Cloudflare Pages (Edge Runtime)** via `@cloudflare/next-on-pages`.
*   **Database:** **Cloudflare D1** (Serverless SQLite).
*   **Payments:** **Stripe** (Checkout Sessions & Webhooks).
*   **Routing:** Local D1-backed dispatch stops with an in-app route optimizer.
*   **Auth:** **Auth.js** (NextAuth) with Magic Link provider.

## 2. Core Implementation Patterns

### 2.0 Backend Layers
Backend code is split into small layers so request handlers stay thin:

*   **Route Handlers:** `src/app/api/**/route.ts` parse requests, enforce Auth.js/CSRF where needed, map errors to HTTP responses, and call application services.
*   **Application Services:** `src/lib/checkout/`, `src/lib/admin/`, and `src/lib/webhooks/` own workflow orchestration such as checkout lead capture, admin customer updates, settings changes, Stripe lifecycle processing, and dispatch route actions.
*   **Composition:** `src/lib/backend/createServices.ts` centralizes construction of D1 repositories, payment adapters, dispatch coordinators, route optimizers, and lifecycle services from `Env`.
*   **Repositories:** `src/lib/db/` exposes domain-oriented interfaces for customers, subscriptions, service history, and dispatch stops.
*   **Adapters:** `StripeAdapter` is the payment boundary. Dispatch workers and routes should use composition helpers instead of constructing repositories or services directly.

### 2.1. The Route Optimizer
Service Route generation uses local D1-backed dispatch stops and an in-app route optimizer.
- **Location:** `src/lib/dispatch/`
- **Implementation:** `RouteOptimizer.ts` sequences planned dispatch stops for v1.
- **Mandate:** Keep route-ordering details behind dispatch services so a future optimizer can be swapped in without changing route handlers or cron entrypoints.

### 2.2. The Daily Dispatch Cron (State-Driven)
A Cloudflare Scheduled Worker runs every day at 00:00 UTC. Dispatch service dates are interpreted in America/New_York, so the worker intentionally runs the prior Eastern evening and builds Service Routes for the next Eastern service date.
- **Logic:**
    1. Select active subscriptions that are not paused.
    2. Evaluate due eligibility against the target Eastern service date.
    3. Filter to subscriptions whose Service Day matches that target date.
    4. Create local dispatch stops and pending service history records in D1 for Admin-Driver fulfillment.

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
