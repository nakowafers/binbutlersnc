import { test, expect } from '@playwright/test';
import { runDb, cleanTestRecords } from './test-db';
import crypto from 'node:crypto';

test.describe('Admin Dashboard E2E Tests', () => {
    const adminEmail = 'admin@example.com';
    const adminId = 'admin_user_123';
    const sessionToken = crypto.randomUUID();

    test.beforeAll(async () => {
        // 1. Clean previous test records
        try {
            cleanTestRecords();
        } catch (e) {
            console.warn('Failed to clean test records (might be first run):', e);
        }

        // 2. Seed Admin User
        runDb(`INSERT OR IGNORE INTO customers (id, email, role, name) VALUES ('${adminId}', '${adminEmail}', 'ADMIN', 'Test Admin')`);
        
        // 3. Seed active subscription and some history for stats
        runDb(`INSERT OR IGNORE INTO addresses (id, customer_id, raw_address, trash_day) VALUES ('addr_1', 'cust_1', '123 Main St', 'MON')`);
        runDb(`INSERT OR IGNORE INTO customers (id, email, address_id, name) VALUES ('cust_1', 'customer1@example.com', 'addr_1', 'Jane Doe')`);
        runDb(`INSERT OR IGNORE INTO subscriptions (id, customer_id, status, frequency_days) VALUES ('sub_1', 'cust_1', 'active', 28)`);
        runDb(`INSERT OR IGNORE INTO service_history (id, subscription_id, customer_id, dispatch_status, service_date) VALUES ('srv_1', 'sub_1', 'cust_1', 'Completed', datetime('now', '-1 days'))`);
    });

    test.beforeEach(async ({ context }) => {
        // Set up the session cookie
        const expires = new Date();
        expires.setFullYear(expires.getFullYear() + 1);

        // Seed Session in DB
        runDb(`INSERT OR IGNORE INTO sessions (id, sessionToken, userId, expires) VALUES ('${crypto.randomUUID()}', '${sessionToken}', '${adminId}', '${expires.toISOString()}')`);

        await context.addCookies([
            {
                name: 'authjs.session-token', // NextAuth v5 default cookie name
                value: sessionToken,
                domain: 'localhost',
                path: '/',
                expires: expires.getTime() / 1000,
                httpOnly: true,
                sameSite: 'Lax',
            },
            // Also try the secure version just in case
            {
                name: '__Secure-authjs.session-token',
                value: sessionToken,
                domain: 'localhost',
                path: '/',
                expires: expires.getTime() / 1000,
                httpOnly: true,
                secure: true,
                sameSite: 'Lax',
            }
        ]);
    });

    test('Admin Dashboard should be accessible to authenticated admin', async ({ page }) => {
        await page.goto('/admin');

        // Verify we are on the dashboard
        await expect(page.getByText('Operations Overview')).toBeVisible();
        await expect(page.getByText('Active Subscriptions')).toBeVisible();
        
        // Verify seeded stats
        await expect(page.locator('h3', { hasText: '1' }).first()).toBeVisible(); // Active Subscriptions count
    });

    test('Admin Dashboard should show recent activity', async ({ page }) => {
        await page.goto('/admin');

        await expect(page.getByText('Recent Activity')).toBeVisible();
        await expect(page.getByText('customer1@example.com')).toBeVisible();
        await expect(page.getByText('123 Main St')).toBeVisible();
        await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    });

    test('Non-admins should be redirected to home', async ({ context, page }) => {
        const userId = 'user_456';
        const userEmail = 'user@example.com';
        const userSessionToken = crypto.randomUUID();

        // Seed non-admin user and session
        runDb(`INSERT OR IGNORE INTO customers (id, email, role) VALUES ('${userId}', '${userEmail}', 'CUSTOMER')`);
        runDb(`INSERT OR IGNORE INTO sessions (id, sessionToken, userId, expires) VALUES ('${crypto.randomUUID()}', '${userSessionToken}', '${userId}', '2030-01-01T00:00:00Z')`);

        await context.clearCookies();
        await context.addCookies([
            {
                name: 'authjs.session-token',
                value: userSessionToken,
                domain: 'localhost',
                path: '/',
                expires: Math.floor(Date.now() / 1000) + 3600,
                httpOnly: true,
                sameSite: 'Lax',
            }
        ]);

        await page.goto('/admin');

        // Should be redirected to home
        await page.waitForURL('http://localhost:3000/');
        await expect(page.getByText('Bin Butlers NC')).toBeVisible();
    });
});
