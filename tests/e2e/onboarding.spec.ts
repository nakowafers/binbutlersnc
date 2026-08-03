import { test, expect, type Page } from '@playwright/test';

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

async function mockGeoapifyAutocomplete(page: Page) {
    await page.route('**/v1/geocode/autocomplete**', async (route) => {
        const url = new URL(route.request().url());
        const text = url.searchParams.get('text') || '123 Mock St, Charlotte, NC';

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                features: [
                    {
                        type: 'Feature',
                        properties: {
                            formatted: text,
                            lat: 35.2271,
                            lon: -80.8431,
                            postcode: '28202',
                        },
                        geometry: {
                            type: 'Point',
                            coordinates: [-80.8431, 35.2271],
                        },
                    },
                ],
            }),
        });
    });
}

async function selectAutocompleteAddress(page: Page, address: string) {
    await page.fill('#address', address);
    await expect(page.locator('.geoapify-autocomplete-item').first()).toBeVisible();
    await page.locator('.geoapify-autocomplete-item').first().click();
}

async function acceptStepThreeConsents(page: Page) {
    await page.check('#age_confirmed');
    await page.check('#tos_accepted');
    await page.check('#contact_consent');
}

test.describe('Onboarding Flow - D2D vs Organic Routing', () => {
    test.beforeEach(async ({ page }) => {
        await mockGeoapifyAutocomplete(page);
        await page.route('**/api/serviceable-zips**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    zips: ['28202', '28031', '28078', '28070', '28036', '28115', '28117'],
                }),
            });
        });
    });

    test('reloads stale pricing with an explanation and preserves entered signup data', async ({ page }) => {
        const signupDocumentRequests: string[] = [];
        let capturedPayload: Record<string, unknown> | null = null;
        page.on('request', (request) => {
            if (request.resourceType() === 'document' && request.url().includes('/signup')) {
                signupDocumentRequests.push(request.url());
            }
        });

        await page.route('**/api/checkout', async (route) => {
            capturedPayload = route.request().postDataJSON();
            await route.fulfill({
                status: 409,
                contentType: 'application/json',
                body: JSON.stringify({
                    code: 'pricing_version_mismatch',
                    error: 'Pricing has changed. Please review the latest prices before checkout.',
                }),
            });
        });

        await page.goto('/signup');
        await page.fill('#first_name', 'Patricia');
        await page.fill('#last_name', 'Preserved');
        await selectAutocompleteAddress(page, '321 Saved Form St, Charlotte, NC');
        await page.selectOption('#trash_day', 'MON');
        await page.fill('#bin_quantity', '2');
        await page.getByRole('button', { name: 'Next Step' }).click();
        await page.fill('#email', 'preserved@example.com');
        await page.fill('#phone_number', '7045550199');
        await page.getByRole('button', { name: 'Review Agreement' }).click();
        await acceptStepThreeConsents(page);
        await page.getByRole('button', { name: 'Go to Payment' }).click();

        await expect(page.locator('form').getByText('Pricing has changed. Please review the latest prices before checkout.', { exact: true })).toBeVisible();
        await expect.poll(() => signupDocumentRequests.length).toBe(2);
        await expect(page.getByText('Service Agreement', { exact: true })).toBeVisible();
        await page.locator('form button[type="button"]').first().click();
        await expect(page.locator('#email')).toHaveValue('preserved@example.com');
        await page.getByRole('button', { name: 'Review Agreement' }).locator('..').locator('button').first().click();
        await expect(page.locator('#first_name')).toHaveValue('Patricia');
        expect(capturedPayload).toMatchObject({
            frequency: 'monthly',
            pricing_version: '2026-08-monthly35-bimonthly50',
        });
    });

    test('Quarterly pricing stays consistent from landing page through agreement', async ({ page }) => {
        let capturedPayload: Record<string, unknown> | null = null;

        await page.route('**/api/checkout', async (route) => {
            capturedPayload = route.request().postDataJSON();
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ url: '/success?session_id=sess_quarterly_test' }),
            });
        });

        await page.goto('/');

        const landingCard = page.getByRole('heading', { name: 'Quarterly', exact: true }).locator('..');
        await expect(landingCard.getByText('$60', { exact: true })).toBeVisible();
        await expect(landingCard.getByText('/qtr', { exact: true })).toBeVisible();
        await expect(landingCard.getByText('Cleaned every 12 weeks', { exact: true })).toBeVisible();

        await page.goto('/signup?frequency=quarterly');
        await page.fill('#first_name', 'Quinn');
        await page.fill('#last_name', 'Quarterly');
        await selectAutocompleteAddress(page, '123 Quarterly St, Charlotte, NC');
        await page.selectOption('#trash_day', 'MON');
        await page.fill('#bin_quantity', '3');
        await page.fill('#notes', 'Waste Co');

        await expect(page.getByText('$65', { exact: true })).toBeVisible();
        await expect(page.getByText('Cleaned every 12 weeks', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Next Step' }).click();
        await page.fill('#email', 'quarterly@example.com');
        await page.fill('#phone_number', '7045556060');

        await expect(page.getByText(/\$65 recurring every 12 weeks/)).toBeVisible();

        await page.getByRole('button', { name: 'Review Agreement' }).click();
        await expect(page.getByText(/recurring subscription of \$65 \(every 12 weeks\)/)).toBeVisible();

        await acceptStepThreeConsents(page);
        await page.getByRole('button', { name: 'Go to Payment' }).click();
        await page.waitForURL('**/success**');

        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.frequency).toBe('quarterly');
        expect(capturedPayload!.bin_quantity).toBe(3);
    });

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
        await page.fill('#first_name', 'Olivia');
        await page.fill('#last_name', 'Parker');
        await selectAutocompleteAddress(page, '123 Organic St, Charlotte, NC');
        await page.selectOption('#trash_day', 'MON');
        await page.fill('#bin_quantity', '2');
        await page.fill('#notes', 'Waste Co');

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
        await acceptStepThreeConsents(page);

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
        await page.fill('#first_name', 'Derek');
        await page.fill('#last_name', 'Mason');
        await selectAutocompleteAddress(page, '456 D2D Rd, Charlotte, NC');
        await page.selectOption('#trash_day', 'TUE');
        await page.fill('#bin_quantity', '1');
        await page.fill('#notes', 'Waste Management');

        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: Fill D2D-specific fields
        await page.fill('#email', 'd2d@example.com');
        await page.fill('#phone_number', '7045559876');
        await page.fill('#sales_rep_id', 'rep123');

        // Setup fee override field should appear
        await page.waitForTimeout(1000);
        await expect(page.getByLabel('Initial Clean Fee ($)')).toBeVisible({ timeout: 10000 });

        // Override the setup fee to $50
        const feeInput = page.locator('#setup_fee_override');
        await feeInput.clear();
        await feeInput.fill('50');

        // Click Review Agreement
        await page.getByRole('button', { name: 'Review Agreement' }).click();

        // Step 3: Accept ToS and submit
        await acceptStepThreeConsents(page);
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
        await page.fill('#first_name', 'Tina');
        await page.fill('#last_name', 'Bennett');
        await page.getByText('One-Time Clean').click();
        await selectAutocompleteAddress(page, '789 OneTime Rd, Charlotte, NC');
        await page.selectOption('#trash_day', 'WED');
        await page.fill('#bin_quantity', '1');
        await page.fill('#notes', 'City of Charlotte');

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

        // Step 1: Fill all required fields EXCEPT notes
        await page.fill('#first_name', 'Noah');
        await page.fill('#last_name', 'Hughes');
        await selectAutocompleteAddress(page, '999 Optional Ln, Charlotte, NC');
        await page.selectOption('#trash_day', 'THU');
        await page.fill('#bin_quantity', '1');

        // notes is NOT filled — verifying it's optional

        // Verify progress is not blocked (no validation error for missing notes)
        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: Fill contact details
        await page.fill('#email', 'noprovider@example.com');
        await page.fill('#phone_number', '7045550000');

        await page.getByRole('button', { name: 'Review Agreement' }).click();

        // Step 3: Accept ToS and submit
        await acceptStepThreeConsents(page);
        await page.getByRole('button', { name: 'Go to Payment' }).click();

        await page.waitForURL('**/success**');

        // Verify the captured payload has notes as empty string
        expect(capturedPayload).not.toBeNull();
        expect(capturedPayload!.notes).toBe('');
    });

    test('Form validation - Step 1 should block progress with empty required fields', async ({ page }) => {
        await page.goto('/signup');

        // Try to proceed without filling any fields
        await page.getByRole('button', { name: 'Next Step' }).click();

        // Should still be on step 1 with validation errors visible
        await expect(page.getByText('Please enter a valid address')).toBeVisible();
    });

    test('Form validation - Step 1 should block a typed address that was not selected from autocomplete', async ({ page }) => {
        await page.goto('/signup');

        await page.fill('#first_name', 'Sam');
        await page.fill('#last_name', 'Tester');
        await page.fill('#address', '123 Typed Only Rd, Charlotte, NC');
        await page.selectOption('#trash_day', 'FRI');
        await page.fill('#bin_quantity', '1');

        await page.getByRole('button', { name: 'Next Step' }).click();

        await expect(page.getByText('Please select an address from the autocomplete suggestions')).toBeVisible();
        await expect(page.getByText('Final Details')).not.toBeVisible();
    });

    test('Form validation - Step 2 should block progress with invalid email', async ({ page }) => {
        await page.goto('/signup');

        // Fill Step 1 completely
        await page.fill('#first_name', 'Riley');
        await page.fill('#last_name', 'Turner');
        await selectAutocompleteAddress(page, '100 Valid St, Charlotte, NC');
        await page.selectOption('#trash_day', 'FRI');
        await page.fill('#bin_quantity', '1');
        await page.fill('#notes', 'Some Provider');
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
        await page.fill('#first_name', 'Chloe');
        await page.fill('#last_name', 'Reed');
        await selectAutocompleteAddress(page, '123 Persist Fee St, Charlotte, NC');
        await page.selectOption('#trash_day', 'WED');
        await page.fill('#bin_quantity', '1');
        await page.fill('#notes', 'Waste Co');
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

        // Re-open date picker and close it again to prove the fee value survives interaction.
        await dateButton.click();
        await page.keyboard.press('Escape');
        await expect(page.locator('[role="dialog"]')).not.toBeVisible();

        // Fee override should STILL be visible with correct value
        await expect(feeLabel).toBeVisible();
        await expect(feeInput).toHaveValue('55');

        // Complete the flow
        await page.getByRole('button', { name: 'Review Agreement' }).click();

        // Step 3: Accept ToS and submit
        await acceptStepThreeConsents(page);
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
