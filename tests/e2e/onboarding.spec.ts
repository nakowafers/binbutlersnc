import { test, expect } from '@playwright/test';

/**
 * Onboarding E2E Tests
 * 
 * These tests verify the customer signup flow including:
 * - Organic signup (no sales rep) step-by-step form navigation
 * - D2D signup (with sales rep) with setup fee override
 * - One-time clean flow (skips agreement step)
 * - Form validation and error handling
 * 
 * These tests mock the /api/checkout endpoint to avoid real Stripe sessions,
 * but verify the full client-side form flow and API request payload.
 * 
 * Run via: npm run test:e2e
 */

test.describe('Onboarding Flow - D2D vs Organic Routing', () => {

    test('Organic Signup Flow (no sales rep ID) - full multi-step form', async ({ page }) => {
        let capturedPayload: Record<string, unknown> | null = null;

        // Intercept /api/checkout to capture the payload and mock the redirect
        await page.route('**/api/checkout', async (route) => {
            capturedPayload = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ url: `/success?session_id=sess_organic_test` }),
            });
        });

        await page.goto('/signup');

        // Step 1: Address and plan details
        await page.fill('#address', '123 Organic St, Charlotte, NC');
        await page.selectOption('#trash_day', 'MON');
        await page.fill('#bin_quantity', '2');
        await page.fill('#provider_name', 'Waste Co');

        // Verify monthly is selected by default
        const monthlyRadio = page.locator('#monthly');
        await expect(monthlyRadio).toBeChecked();

        // Click Next Step
        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: Customer contact details
        await page.fill('#email', 'organic@example.com');
        await page.fill('#phone_number', '7045550123');
        // Sales Rep ID is deliberately left blank for Organic flow

        // Verify summary shows correct info
        await expect(page.getByText('Monthly')).toBeVisible();

        // Click Review Agreement
        await page.getByRole('button', { name: 'Review Agreement' }).click();

        // Step 3: Service Agreement
        await expect(page.getByText('Service Agreement', { exact: true })).toBeVisible();
        await expect(page.getByText('Service Agreement for 123 Organic St')).toBeVisible();

        // "Go to Payment" should be disabled until ToS is accepted
        const paymentButton = page.getByRole('button', { name: 'Go to Payment' });
        await expect(paymentButton).toBeDisabled();

        // Accept ToS
        await page.check('#tos_accepted');

        // Now submit should be enabled
        await expect(paymentButton).toBeEnabled();
        await paymentButton.click();

        // Verify redirect to success page
        await page.waitForURL('**/success**');

        // Verify the captured payload has no sales_rep_id
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.email).toBe('organic@example.com');
        expect(capturedPayload!.phone_number).toBe('7045550123');
        expect(capturedPayload!.frequency).toBe('monthly');
        expect(capturedPayload!.bin_quantity).toBe(2);
        expect(capturedPayload!.trash_day).toBe('MON');
        // Organic: sales_rep_id should be empty or undefined
        expect(capturedPayload!.sales_rep_id || '').toBe('');
    });

    test('D2D Signup Flow (with sales rep ID and setup fee override)', async ({ page }) => {
        let capturedPayload: Record<string, unknown> | null = null;

        await page.route('**/api/checkout', async (route) => {
            capturedPayload = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ url: `/success?session_id=sess_d2d_test` }),
            });
        });

        await page.goto('/signup');

        // Step 1
        await page.fill('#address', '456 D2D Rd, Charlotte, NC');
        await page.selectOption('#trash_day', 'TUE');
        await page.fill('#bin_quantity', '1');
        await page.fill('#provider_name', 'Waste Management');

        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: Fill D2D-specific fields
        await page.fill('#email', 'd2d@example.com');
        await page.fill('#phone_number', '7045559876');
        await page.fill('#sales_rep_id', 'rep123');

        // Setup fee override field should appear
        await expect(page.getByLabel('Initial Clean Fee ($)')).toBeVisible();

        // Override the setup fee to $50
        const feeInput = page.locator('#setup_fee_override');
        await feeInput.clear();
        await feeInput.fill('50');

        // Click Review Agreement
        await page.getByRole('button', { name: 'Review Agreement' }).click();

        // Step 3: Accept ToS and submit
        await page.check('#tos_accepted');
        await page.getByRole('button', { name: 'Go to Payment' }).click();

        // Verify redirect
        await page.waitForURL('**/success**');

        // Verify the captured payload
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.email).toBe('d2d@example.com');
        expect(capturedPayload!.sales_rep_id).toBe('REP123');
        expect(capturedPayload!.setup_fee_override).toBe(50);
        expect(capturedPayload!.frequency).toBe('monthly');
    });

    test('One-Time Clean Flow (skips agreement step entirely)', async ({ page }) => {
        let capturedPayload: Record<string, unknown> | null = null;

        await page.route('**/api/checkout', async (route) => {
            capturedPayload = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ url: `/success?session_id=sess_onetime_test` }),
            });
        });

        await page.goto('/signup');

        // Step 1: Select one-time and fill details
        await page.getByText('One-Time Clean').click();
        await page.fill('#address', '789 OneTime Rd, Charlotte, NC');
        await page.selectOption('#trash_day', 'WED');
        await page.fill('#bin_quantity', '1');
        await page.fill('#provider_name', 'City of Charlotte');

        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: For one-time, "Go to Payment" should appear directly
        await page.fill('#email', 'onetime@example.com');
        await page.fill('#phone_number', '7045559999');

        // "Review Agreement" should NOT be visible, "Go to Payment" should be
        await expect(page.getByRole('button', { name: 'Review Agreement' })).not.toBeVisible();
        const paymentButton = page.getByRole('button', { name: 'Go to Payment' });
        await expect(paymentButton).toBeVisible();

        await paymentButton.click();

        // Verify redirect
        await page.waitForURL('**/success**');

        // Verify payload
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.frequency).toBe('one-time');
        expect(capturedPayload!.email).toBe('onetime@example.com');
    });

    test('Organic Signup without Service Provider (optional field)', async ({ page }) => {
        let capturedPayload: Record<string, unknown> | null = null;

        await page.route('**/api/checkout', async (route) => {
            capturedPayload = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ url: `/success?session_id=sess_no_provider_test` }),
            });
        });

        await page.goto('/signup');

        // Step 1: Fill all required fields EXCEPT provider_name
        await page.fill('#address', '999 Optional Ln, Charlotte, NC');
        await page.selectOption('#trash_day', 'THU');
        await page.fill('#bin_quantity', '1');

        // provider_name is NOT filled — verifying it's optional

        // Verify progress is not blocked (no validation error for missing provider)
        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: Fill contact details
        await page.fill('#email', 'noprovider@example.com');
        await page.fill('#phone_number', '7045550000');

        await page.getByRole('button', { name: 'Review Agreement' }).click();

        // Step 3: Accept ToS and submit
        await page.check('#tos_accepted');
        await page.getByRole('button', { name: 'Go to Payment' }).click();

        await page.waitForURL('**/success**');

        // Verify the captured payload has provider_name as empty string
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.provider_name).toBe('');
    });

    test('Form validation - Step 1 should block progress with empty required fields', async ({ page }) => {
        await page.goto('/signup');

        // Try to proceed without filling any fields
        await page.getByRole('button', { name: 'Next Step' }).click();

        // Should still be on step 1 with validation errors visible
        await expect(page.getByText('Please enter a valid address')).toBeVisible();
    });

    test('Form validation - Step 2 should block progress with invalid email', async ({ page }) => {
        await page.goto('/signup');

        // Fill Step 1 completely
        await page.fill('#address', '100 Valid St, Charlotte, NC');
        await page.selectOption('#trash_day', 'FRI');
        await page.fill('#bin_quantity', '1');
        await page.fill('#provider_name', 'Some Provider');
        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: Fill invalid email
        await page.fill('#email', 'not-valid');
        await page.fill('#phone_number', '7045551234');

        // Try to proceed
        await page.getByRole('button', { name: 'Review Agreement' }).click();

        // Should show email validation error
        await expect(page.getByText('Please enter a valid email')).toBeVisible();
    });

    test('D2D Fee Override persists after date picker interaction', async ({ page }) => {
        let capturedPayload: Record<string, unknown> | null = null;

        // Mock /api/check-sales-rep to reliably return allowed: true
        await page.route('**/api/check-sales-rep', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ allowed: true }),
            });
        });

        // Mock /api/checkout to capture the payload
        await page.route('**/api/checkout', async (route) => {
            capturedPayload = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ url: '/success?session_id=sess_fee_persist_test' }),
            });
        });

        await page.goto('/signup');

        // Step 1: Address and plan details
        await page.fill('#address', '123 Persist Fee St, Charlotte, NC');
        await page.selectOption('#trash_day', 'WED');
        await page.fill('#bin_quantity', '1');
        await page.fill('#provider_name', 'Waste Co');
        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: Contact info + sales rep ID
        await page.fill('#email', 'persist@example.com');
        await page.fill('#phone_number', '7045551234');
        await page.fill('#sales_rep_id', 'REP123');

        // Fee override should appear after debounce + API response
        const feeLabel = page.getByLabel('Initial Clean Fee ($)');
        await expect(feeLabel).toBeVisible();

        // Set a custom fee override value
        const feeInput = page.locator('#setup_fee_override');
        await feeInput.clear();
        await feeInput.fill('55');
        await expect(feeInput).toHaveValue('55');

        // Open the date picker popover
        const dateButton = page.getByLabel('Next Service Date');
        await dateButton.click();
        await expect(page.locator('[role="dialog"]')).toBeVisible();

        // Close the date picker (Escape key)
        await page.keyboard.press('Escape');
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();

        // Fee override should STILL be visible with correct value
        await expect(feeLabel).toBeVisible();
        await expect(feeInput).toHaveValue('55');

        // Re-open date picker and select the first non-disabled date
        await dateButton.click();
        await page.locator('[role="dialog"] button:not([disabled])').first().click();
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();

        // Fee override should STILL be visible with correct value
        await expect(feeLabel).toBeVisible();
        await expect(feeInput).toHaveValue('55');

        // Complete the flow
        await page.getByRole('button', { name: 'Review Agreement' }).click();

        // Step 3: Accept ToS and submit
        await page.check('#tos_accepted');
        await page.getByRole('button', { name: 'Go to Payment' }).click();

        await page.waitForURL('**/success**');

        // Verify payload has all expected fields
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.sales_rep_id).toBe('REP123');
        expect(capturedPayload!.setup_fee_override).toBe(55);
        expect(capturedPayload!.next_service_date).toBeDefined();
        expect(capturedPayload!.frequency).toBe('monthly');
    });
});
