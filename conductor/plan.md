# Stripe Integration & Sandbox Testing Plan

This document outlines the steps to configure your Stripe Sandbox, set up the required products and prices, configure your local environment, and test the end-to-end checkout flow using the existing application code.

## 1. Stripe Sandbox Setup

1. **Create/Log in to Stripe**: Go to [dashboard.stripe.com](https://dashboard.stripe.com/) and log in or create an account.
2. **Enable Test Mode**: In the upper right corner of the dashboard, toggle the **"Test mode"** switch so it is active. Everything you do now will be safely sandboxed.
3. **Get API Keys**:
   - Navigate to **Developers > API keys**.
   - Note down the **Publishable key** (`pk_test_...`) and the **Secret key** (`sk_test_...`). You will need the Secret key for your environment variables.

## 2. Product & Price Configuration

Your application code (`src/app/api/checkout/route.ts`) expects specific pricing structures. You need to create these in the Stripe Dashboard.

1. Navigate to **Product Catalog > Products**.
2. Click **Add Product**.

### A. Monthly Service
- **Name**: Monthly Bin Cleaning
- **Pricing model**: Standard pricing
- **Price**: (Set your monthly rate, e.g., $30.00)
- **Billing period**: Monthly
- Save product. Copy the resulting **Price ID** (starts with `price_...`).

### B. Quarterly Service
- **Name**: Quarterly Bin Cleaning
- **Pricing model**: Standard pricing
- **Price**: (Set your quarterly rate, e.g., $75.00)
- **Billing period**: Every 3 months
- Save product. Copy the resulting **Price ID**.

### C. One-Time Service
- **Name**: One-Time Bin Cleaning
- **Pricing model**: Standard pricing
- **Price**: (Set your one-time rate, e.g., $50.00)
- **Billing period**: One-time (not recurring)
- Save product. Copy the resulting **Price ID**.

### D. Setup Fee
- **Name**: Initial Setup Fee
- **Pricing model**: Standard pricing
- **Price**: (Set your default setup fee, e.g., $15.00)
- **Billing period**: One-time
- Save product. Copy the resulting **Price ID**.

## 3. Environment Setup

Configure your local Cloudflare Pages environment variables. Open (or create) your `.dev.vars` file in the project root and add the following:

```env
# Stripe Secrets
STRIPE_SECRET_KEY=sk_test_... # From Step 1
STRIPE_WEBHOOK_SECRET=whsec_... # You will get this in Step 4

# Stripe Price IDs (from Step 2)
STRIPE_MONTHLY_PRICE_ID=price_...
STRIPE_QUARTERLY_PRICE_ID=price_...
STRIPE_ONETIME_PRICE_ID=price_...
STRIPE_SETUP_FEE_PRICE_ID=price_...
```

## 4. Local Webhook Testing

Stripe needs a way to send webhook events to your `localhost`. You will use the Stripe CLI for this.

1. **Install Stripe CLI**: Follow instructions at [Stripe CLI Docs](https://docs.stripe.com/stripe-cli) (e.g., `brew install stripe/stripe-cli/stripe` on macOS).
2. **Login**: Run `stripe login` in your terminal and follow the browser prompts.
3. **Forward Webhooks**: Run the following command to forward events to your local Next.js server:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. **Get Webhook Secret**: The output of the `stripe listen` command will print a webhook signing secret (`whsec_...`). 
5. **Update `.dev.vars`**: Add this secret to `STRIPE_WEBHOOK_SECRET` in your `.dev.vars` file.

## 5. End-to-End Flow Testing

Now you can test the full integration locally.

1. **Start the App**: Keep the `stripe listen` terminal running. In a new terminal, start your local server:
   ```bash
   npm run dev
   # OR for cloudflare testing
   npm run preview 
   ```
2. **Initiate Checkout**: Go to your signup flow (e.g., `http://localhost:3000/signup`) and submit the form to hit the `/api/checkout` endpoint.
3. **Use Test Cards**: You will be redirected to the Stripe Checkout page. Use the Stripe test cards to simulate a successful payment:
   - **Card Number**: `4242 4242 4242 4242`
   - **Expiry**: Any future date (e.g., `12/34`)
   - **CVC**: Any 3 digits (e.g., `123`)
   - **Name/ZIP**: Any values
4. **Verify Webhook**: 
   - Check the `stripe listen` terminal. You should see a `checkout.session.completed` event marked as `[200]`.
   - Check your local D1 database to ensure the Lead was converted, and the Customer, Address, and Subscription records were created successfully.
