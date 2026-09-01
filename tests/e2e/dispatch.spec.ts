import { test, expect } from '@playwright/test';
import { runDb } from './test-db';
import { addAuthSessionCookie } from './auth';

test.describe('Admin Dispatch Route', () => {
    test.describe.configure({ mode: 'serial' });

    const adminEmail = 'dispatch-admin@example.com';
    const adminId = 'dispatch_admin_user';
    const today = new Date().toISOString().split('T')[0];

    test.beforeAll(() => {
        runDb("DELETE FROM dispatch_stops WHERE id LIKE 'e2e_dispatch_%'");
        runDb("DELETE FROM service_history WHERE id LIKE 'e2e_history_%'");
        runDb("DELETE FROM subscriptions WHERE id LIKE 'e2e_sub_%'");
        runDb("DELETE FROM addresses WHERE id LIKE 'e2e_addr_%'");
        runDb("DELETE FROM customers WHERE id LIKE 'e2e_cust_%'");
        runDb(`INSERT OR IGNORE INTO auth_users (id, email, name) VALUES ('${adminId}', '${adminEmail}', 'Dispatch Admin')`);
        runDb(`INSERT OR REPLACE INTO sales_reps (id, email, is_admin, is_active, can_override_fee) VALUES ('E2EDRIVER', '${adminEmail}', 1, 1, 0)`);
        runDb("INSERT INTO global_settings (key, value) VALUES ('default_driver_sales_rep_id', 'E2EDRIVER') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
        runDb("INSERT INTO global_settings (key, value) VALUES ('route_depot_address', 'Wilmington, NC') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
        runDb("INSERT INTO global_settings (key, value) VALUES ('route_depot_lat', '34.2257') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
        runDb("INSERT INTO global_settings (key, value) VALUES ('route_depot_lng', '-77.9447') ON CONFLICT(key) DO UPDATE SET value = excluded.value");

        for (let i = 1; i <= 2; i++) {
            runDb(`INSERT INTO customers (id, email, first_name, last_name, phone_number, bin_quantity) VALUES ('e2e_cust_${i}', 'dispatch${i}@example.com', 'Dispatch', 'Customer ${i}', '(910) 555-010${i}', ${i})`);
            runDb(`INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, service_day, notes, scent_preference) VALUES ('e2e_addr_${i}', 'e2e_cust_${i}', '${i} Dispatch St, Wilmington, NC', 34.2${i}, -77.9${i}, 'MON', ${i === 1 ? "'Gate code 1234'" : 'NULL'}, 'lavender')`);
            runDb(`UPDATE customers SET address_id = 'e2e_addr_${i}' WHERE id = 'e2e_cust_${i}'`);
            runDb(`INSERT INTO subscriptions (id, customer_id, status, frequency_days) VALUES ('e2e_sub_${i}', 'e2e_cust_${i}', 'active', 28)`);
            runDb(`INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, bin_quantity) VALUES ('e2e_history_${i}', 'e2e_sub_${i}', '${today}', 'Pending', ${i})`);
            runDb(`INSERT INTO dispatch_stops (id, subscription_id, service_history_id, service_date, driver_sales_rep_id, route_sequence_order, customer_name, raw_address, latitude, longitude, bin_count, customer_scent, service_notes, customer_phone) VALUES ('e2e_dispatch_${i}', 'e2e_sub_${i}', 'e2e_history_${i}', '${today}', 'E2EDRIVER', ${i}, 'Dispatch Customer ${i}', '${i} Dispatch St, Wilmington, NC', 34.2${i}, -77.9${i}, ${i}, 'lavender', ${i === 1 ? "'Gate code 1234'" : 'NULL'}, '(910) 555-010${i}')`);
        }
    });

    test.beforeEach(async ({ context }) => {
        await addAuthSessionCookie(context, {
            id: adminId,
            email: adminEmail,
            name: 'Dispatch Admin',
            role: 'ADMIN',
        });
    });

    test('uses the raw address for Apple Maps and Google Maps even when coordinates are present', async ({ page }) => {
        const rawAddress = '1 Dispatch & Main St, Wilmington, NC';
        const encodedAddress = encodeURIComponent(rawAddress);

        runDb(`UPDATE dispatch_stops SET raw_address = '${rawAddress}' WHERE id = 'e2e_dispatch_1'`);

        await page.goto(`/admin/dispatch?driver=E2EDRIVER&date=${today}`);

        await expect(page.getByRole('link', { name: 'Apple Maps' }).first())
            .toHaveAttribute('href', `maps://?daddr=${encodedAddress}&dirflg=d`);
        await expect(page.getByRole('link', { name: 'Google Maps' }).first())
            .toHaveAttribute('href', `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`);
    });

    for (const width of [390, 430, 768, 1280]) {
        test(`route page is usable without horizontal overflow at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`/admin/dispatch?driver=E2EDRIVER&date=${today}`);

            await expect(page.getByRole('heading', { name: 'My Route' })).toBeVisible();
            await expect(page.getByText('Stop #1')).toBeVisible();
            await expect(page.getByRole('link', { name: /Apple Maps/ }).first()).toBeVisible();
            await expect(page.getByRole('button', { name: /Mark Complete/ }).first()).toBeVisible();

            const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
            expect(hasOverflow).toBe(false);
        });
    }
});
