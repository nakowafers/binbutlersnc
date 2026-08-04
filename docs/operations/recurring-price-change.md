# Recurring Stripe Price Change Runbook

Use this runbook when changing a recurring Subscription rate. Stripe Price amounts are immutable, so a rate change creates a new Price while existing Subscriptions keep their existing Price references.

## 1. Validate the catalog in test mode

1. Confirm the intended existing Stripe Product for every affected Subscription.
2. Create active test Prices with the approved USD amount and exact weekly interval.
3. Validate each extra-bin Price before reuse: it must be active, USD, $5, attached to the intended extra-bin Product, and use the matching weekly interval. Create a replacement only when one of those checks fails.
4. Open unpaid test Checkout Sessions for the included-bin and first-extra-bin cases. Confirm the initial fee, recurring total, Product, interval, tax behavior, and metadata. Do not record credentials, customer data, or full Checkout URLs in evidence.

## 2. Prepare the live cutover

1. Repeat the catalog and add-on validation in live mode. Do not copy test-mode IDs into live configuration.
2. Disable Billing Portal Subscription plan switching while retaining approved payment-method, invoice, cancellation, and other portal functions.
3. Store every validated live Price ID in its existing GitHub Actions secret. Do not introduce versioned binding names or commit IDs to the repository.
4. Record the exact currently deployed Cloudflare Worker version so it can be selected for rollback.
5. Record a PII-free grandfathering baseline: active and trialing Subscription-item counts grouped by legacy Price ID.
6. Confirm the deployment workflow validates all affected bindings and passes them to the same Worker version upload as the application code.

## 3. Deploy and verify

1. Deploy the application and Price bindings together in one Worker version. Stop if any binding, catalog validation, portal configuration, rollback version, or baseline is missing.
2. Verify the public pricing cards and open unpaid live Checkout Sessions for representative included-bin and extra-bin selections. Confirm the initial fee and every recurring line item; do not complete a live payment.
3. Compare the grandfathering baseline with current Subscription-item Price references and confirm that no existing Subscription was migrated, scheduled, prorated, or otherwise mutated.
4. Set the verified new base Prices as their Products' defaults.
5. Archive the replaced base Prices and any replaced add-on Prices. Leave compatible reused add-on Prices active. Sanitize operational evidence so it contains no secrets, PII, or reusable hosted Checkout URLs.

## 4. Roll back

- Before archival, deploy the recorded previous Worker version.
- After archival, first reactivate every legacy Price required by the previous version and restore legacy Product defaults where appropriate. Only then deploy the recorded previous Worker version.
- Re-run unpaid Checkout and grandfathering verification after rollback. Never mutate existing Subscriptions as part of rollback.
