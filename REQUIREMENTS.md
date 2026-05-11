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
*   **Backend Logic:** Cloudflare Workers (integrated via Next.js API routes).
*   **Database:** **Cloudflare D1** (Serverless SQLite) for relational storage.
*   **Payments & Subscriptions:** **Stripe** (Checkout, Customer Portal, and Webhooks).
*   **Route Optimization:** **Routific API** for fleet dispatch and driver navigation.
*   **Communications:** (Optional/Future) Resend or SendGrid for transactional notifications.

---

## 3. Design Patterns & Modularity

### The Adapter Pattern (Routing)
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

### 4.1. Customer Discovery & Onboarding (D2D Optimized)
1.  **Sales Rep Attribution:** Onboarding URLs will support a `?rep=REP_ID` parameter. The system must capture and persist this ID to track performance.
2.  **Address Entry:** Physical address validated and geocoded.
3.  **Service Logistics (Manual Input):**
    - **Trash Day:** Dropdown (Monday-Friday).
    - **Provider:** Dropdown (e.g., Town of Cary, Waste Management).
    - **Bin Quantity:** Numeric input (Total # of bins).
4.  **Tier Selection:** Frequency selection (Monthly, Quarterly, One-Time).
5.  **Dynamic Pricing:** Total Price = `Bin Quantity` * `Tier Base Price`.

### 4.2. Checkout & Provisioning
1.  **Stripe Integration:** Passes `quantity` based on Bin Count to the Stripe Checkout session.
2.  **Service Day Logic:** The system automatically calculates `service_day = trash_day + 1` (wrapping Friday to Monday if applicable, though typically Saturday).
3.  **Route Assignment:** Maps address to `service_route_id` based on the calculated `service_day`.

### 4.3. Dispatch & Automation (Weekly Cron Strategy)
1.  **Stop Management:** Instead of keeping all customers in the routing provider indefinitely, the system uses a **Weekly Dispatch Cron**.
2.  **Execution:** Every Sunday at 00:00 UTC, the system:
    - Queries D1 for all customers "due" for cleaning based on their frequency (Monthly/Quarterly) and last service date.
    - Pushes only "Active" stops for that week to the Routing Provider via the Adapter.
    - Sets `dispatch_status = 'dispatched'` in D1.

### 4.4. Client Self-Management
1.  **Portal:** Access to the Stripe Customer Portal for updating payment methods or cancelling subscriptions.
2.  **Status Sync:** Cancellations in Stripe must trigger a webhook to update the `active_subscription` flag in D1 and remove the stop from the routing provider.

### 4.5. Driver Operations
1.  **Execution:** Drivers use the Routific Mobile App for navigation and job completion.
2.  **Feedback Loop:** The system must listen for completion webhooks to log service history.

---

## 5. Backend & API Requirements

### 5.1. Stripe Webhook Handler (`/api/webhooks/stripe`)
- **Event:** `checkout.session.completed`
- **Action:** 
    1. Capture `sales_rep_id` from metadata.
    2. Persist `bin_quantity` and `customer` details to D1.
    3. Calculate the first scheduled cleaning date.
- **Event:** `customer.subscription.deleted`
- **Action:** Set `status = 'cancelled'` in D1 and invoke `RoutingService.deleteTarget()`.

### 5.2. Routing Webhook Listener (`/api/webhooks/routing`)
- **Action:** 
    1. Verify payload signature.
    2. Identify customer via `external_routing_id`.
    3. Write entry to `service_history` table (Timestamp, Status: Completed).

---

## 6. Database Schema (Cloudflare D1)

### Table: `addresses`
- `id` (UUID, PK)
- `raw_address` (String)
- `latitude` (Float)
- `longitude` (Float)
- `trash_day` (Enum: MON-FRI)
- `service_day` (Enum: MON-SAT) -- Auto-calculated: Trash Day + 1.
- `provider_name` (String)

### Table: `service_routes`
- `id` (UUID, PK)
- `route_name` (String) - e.g., "Cary-Tuesday-A"
- `day_of_week` (Enum)
- `is_active` (Boolean)

### Table: `customers`
- `id` (UUID, PK)
- `stripe_customer_id` (String, Indexed)
- `email` (String)
- `address_id` (FK -> addresses.id)
- `bin_quantity` (Integer)
- `sales_rep_id` (String, Optional)
- `external_routing_id` (String)

### Table: `subscriptions`
- `id` (UUID, PK)
- `customer_id` (FK)
- `stripe_subscription_id` (String)
- `status` (String) - e.g., 'active', 'past_due', 'cancelled'
- `tier` (String)

### Table: `service_history`
- `id` (UUID, PK)
- `customer_id` (FK)
- `service_date` (Timestamp)
- `dispatch_status` (String) - 'completed', 'missed', 'skipped'
- `sales_rep_id` (String) -- Tracked for performance querying.

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

**Approval Signature:**  
*Lead Architect: ____________________*  
*QA Lead: __________________________*
