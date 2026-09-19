import { test, expect } from '@playwright/test';

/**
 * Landing Page E2E Tests
 *
 * Smoke coverage for marketing sections on the homepage.
 *
 * Run via: npm run test:e2e
 */

test('Before/After section renders on the landing page', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'See the Bin Butlers Difference' })).toBeVisible();
});
