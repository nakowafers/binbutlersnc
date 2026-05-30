# Plan: Make Service Provider Input Optional

## Objective
Make the "Service Provider" input field in the signup onboarding flow optional, so customers are not forced to provide it if they don't know it or don't want to.

## Key Files & Context
- `src/app/signup/page.tsx`: Contains the onboarding form UI and Zod validation schema.
- `src/app/api/checkout/route.ts`: API route handling the form submission, contains server-side validation.
- `src/lib/payment/StripeAdapter.ts`: Handles creating the Stripe Checkout session and passing metadata.

## Implementation Steps

### 1. Update Frontend Validation & UI
*   **File:** `src/app/signup/page.tsx`
*   **Action:** 
    *   Update `signupSchema` to make `provider_name` optional. Remove the `.min(2, ...)` constraint so empty strings are allowed.
        *   *Change:* `provider_name: z.string().optional()` (or similar to allow empty strings and undefined).
    *   Update the UI Label to clearly indicate it's optional.
        *   *Change:* `<Label htmlFor="provider_name" ...>Service Provider (Optional)</Label>`

### 2. Update Backend Validation
*   **File:** `src/app/api/checkout/route.ts`
*   **Action:** Update the Zod schema to mirror the frontend.
    *   *Change:* `provider_name: z.string().optional()`

### 3. Ensure Stripe Metadata Handles Undefined
*   **File:** `src/lib/payment/StripeAdapter.ts`
*   **Action:** In `createCheckoutSession`, ensure `provider_name` falls back to an empty string if undefined, as Stripe metadata values must be strings. (It appears it already receives it as `params.providerName || undefined` from the checkout route, so adding `|| ''` to the metadata object is safe).
    *   *Change:* `provider_name: params.providerName || ''`

## Verification & Testing
1.  Run the local development server and navigate to `/signup`.
2.  Complete step 1 without filling in the "Service Provider" field and ensure the form proceeds to step 2 without validation errors.
3.  Complete the checkout process to ensure Stripe Checkout session creation succeeds without throwing metadata errors.
4.  Run the existing test suite (`npm run test`) to ensure making the field optional doesn't break tests that currently provide a value.
