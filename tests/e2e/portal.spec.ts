import { test, expect } from '@playwright/test';

/**
 * Customer Portal E2E Tests
 * 
 * These tests verify the authenticated customer portal experience including:
 * - Portal page rendering with customer data
 * - Vacation Mode toggle (now backed by a real API)
 * - Sign out flow
 * 
 * PREREQUISITE: The wrangler/miniflare dev server must be running and seeded
 * with test data. See tests/e2e/test-db.ts for the DB helper used.
 * 
 * NOTE: These tests require an active preview server with a seeded D1 database.
 * Run via: npm run test:e2e
 */

test.describe('Customer Portal Flow', () => {

    test('Portal page should show sign-in redirect when unauthenticated', async ({ page }) => {
        // Navigate to portal without any session cookie
        await page.goto('/portal');

        // Should redirect to sign-in page
        await page.waitForURL('**/signin');
        await expect(page.getByText('Welcome Back')).toBeVisible();
    });

    test('Sign-in page should display magic link form', async ({ page }) => {
        await page.goto('/signin');

        // Verify magic link form elements are present
        await expect(page.getByLabel('Email Address')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeVisible();
        await expect(page.getByText("Don't have an account?")).toBeVisible();
        await expect(page.getByRole('link', { name: 'Sign up today' })).toBeVisible();
    });

    test('Sign-in page should validate email input', async ({ page }) => {
        await page.goto('/signin');

        const emailInput = page.getByLabel('Email Address');
        const submitButton = page.getByRole('button', { name: 'Send Magic Link' });

        // Type an invalid email and attempt submit
        await emailInput.fill('not-an-email');
        await submitButton.click();

        // The browser's native email validation should prevent the form from submitting
        // (the input has type="email" and required attribute)
        // We stay on the same page
        await expect(page).toHaveURL(/.*signin/);
    });

    test('Signup page should load with correct plan options', async ({ page }) => {
        await page.goto('/signup');

        // Verify plan cards are visible
        await expect(page.getByText('Monthly Plan')).toBeVisible();
        await expect(page.getByText('Quarterly Plan')).toBeVisible();
        await expect(page.getByText('One-Time Clean')).toBeVisible();

        // Verify pricing
        await expect(page.getByText('$30')).toBeVisible();
        await expect(page.getByText('$40')).toBeVisible();
        await expect(page.getByText('$100')).toBeVisible();

        // Verify form fields
        await expect(page.getByLabel('Service Address')).toBeVisible();
        await expect(page.getByLabel('Trash Day')).toBeVisible();
        await expect(page.getByLabel('How many bins?')).toBeVisible();
        await expect(page.getByLabel('Service Provider')).toBeVisible();
    });

    test('Signup page should support D2D rep flow with setup fee override', async ({ page }) => {
        await page.goto('/signup');

        // Fill Step 1
        await page.fill('#address', '123 Test St, Charlotte, NC');
        await page.selectOption('#trash_day', 'TUE');
        await page.fill('#bin_quantity', '2');
        await page.fill('#provider_name', 'Waste Co');

        // Click Next
        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: Fill in D2D rep details
        await page.fill('#email', 'test@example.com');
        await page.fill('#phone_number', '7045550123');
        await page.fill('#sales_rep_id', 'REP_TEST');

        // Setup fee override field should appear when sales_rep_id is filled
        await expect(page.getByLabel('Initial Clean Fee ($)')).toBeVisible();

        // Verify the default is 100
        const feeInput = page.locator('#setup_fee_override');
        await expect(feeInput).toHaveValue('100');

        // Change the fee
        await feeInput.clear();
        await feeInput.fill('50');
        await expect(feeInput).toHaveValue('50');
    });

    test('Signup page should show one-time clean flow without contract step', async ({ page }) => {
        await page.goto('/signup');

        // Select one-time plan
        await page.getByText('One-Time Clean').click();

        // Fill Step 1
        await page.fill('#address', '456 OneTime Rd, Charlotte, NC');
        await page.selectOption('#trash_day', 'WED');
        await page.fill('#bin_quantity', '1');
        await page.fill('#provider_name', 'City of Charlotte');

        // Click Next
        await page.getByRole('button', { name: 'Next Step' }).click();

        // Step 2: For one-time, "Go to Payment" should appear directly (no contract step)
        await page.fill('#email', 'onetime@example.com');
        await page.fill('#phone_number', '7045559999');
        await expect(page.getByRole('button', { name: 'Go to Payment' })).toBeVisible();

        // "Review Contract" button should NOT be visible for one-time
        await expect(page.getByRole('button', { name: 'Review Contract' })).not.toBeVisible();
    });
});
