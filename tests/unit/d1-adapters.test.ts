import { describe, it, expect, beforeEach } from 'vitest';
import { DbSimulator } from '../integration/db-simulator';
import { D1LeadRepositoryAdapter } from '../../src/lib/db/adapters/D1LeadRepositoryAdapter';
import { D1CustomerRepositoryAdapter } from '../../src/lib/db/adapters/D1CustomerRepositoryAdapter';

describe('D1 repository adapters', () => {
    let simulator: DbSimulator;

    beforeEach(() => {
        simulator = new DbSimulator();
    });

    it('keeps the lead conversion transaction intact', async () => {
        const leads = new D1LeadRepositoryAdapter(simulator as any);

        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run('lead_tx', 'tx@example.com', '123 TX St', 'REP_123', 0);

        await leads.convertLeadToCustomerTransaction({
            leadId: 'lead_tx',
            email: 'tx@example.com',
            firstName: 'Test',
            lastName: 'User',
            stripeCustomerId: 'cus_tx',
            stripeSubscriptionId: 'sub_tx',
            phoneNumber: '555-1212',
            binQuantity: 2,
            salesRepId: 'REP_123',
            tosAcceptedAt: '2026-06-23T12:00:00.000Z',
            rawAddress: '123 tx st',
            latitude: 35.1,
            longitude: -80.1,
            trashDay: 'TUE',
            serviceDay: 'TUE',
            notes: 'TX route',
            scentPreference: 'lavender',
            subscriptionId: 'subscription_tx',
            addressId: 'address_tx',
            customerId: 'customer_tx',
            currentPeriodEnd: '2026-07-23T00:00:00.000Z',
            serviceHistoryId: 'history_tx',
            frequency: 'monthly',
            nextServiceDate: '2026-06-24',
            serviceHistoryStatus: 'Pending',
        });

        const lead = simulator.db.prepare('SELECT * FROM leads WHERE id = ?').get('lead_tx');
        expect(lead).toBeUndefined();

        const customer = simulator.db.prepare('SELECT * FROM customers WHERE id = ?').get('customer_tx') as any;
        expect(customer).toBeDefined();
        expect(customer.email).toBe('tx@example.com');
        expect(customer.address_id).toBe('address_tx');

        const address = simulator.db.prepare('SELECT * FROM addresses WHERE id = ?').get('address_tx') as any;
        expect(address).toBeDefined();
        expect(address.customer_id).toBe('customer_tx');
        expect(address.service_day).toBe('TUE');

        const subscription = simulator.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get('subscription_tx') as any;
        expect(subscription).toBeDefined();
        expect(subscription.stripe_subscription_id).toBe('sub_tx');
        expect(subscription.current_period_end).toBe('2026-07-23T00:00:00.000Z');

        const history = simulator.db.prepare('SELECT * FROM service_history WHERE id = ?').get('history_tx') as any;
        expect(history).toBeDefined();
        expect(history.dispatch_status).toBe('Pending');
        expect(history.subscription_id).toBe('subscription_tx');
    });

    it('keeps the shared admin read seam intact', async () => {
        const customers = new D1CustomerRepositoryAdapter(simulator as any);

        simulator.db.prepare(
            'INSERT INTO customers (id, email, first_name, last_name, phone_number, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run('customer_admin', 'admin@example.com', 'Admin', 'User', '555-0000', '2026-06-23T12:00:00.000Z');
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, trash_day, service_day, notes, scent_preference) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('address_admin', 'customer_admin', '500 Admin Rd', 'MON', 'MON', 'VIP', 'lavender');
        simulator.db.prepare(
            'UPDATE customers SET address_id = ? WHERE id = ?'
        ).run('address_admin', 'customer_admin');
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, status, frequency_days, current_period_end, next_service_date, is_paused) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run('subscription_admin', 'customer_admin', 'active', 28, '2026-07-01T00:00:00.000Z', '2026-06-30', 0);

        const rows = await customers.getAllCustomersWithDetails();
        expect(rows).toHaveLength(1);
        expect(rows[0].email).toBe('admin@example.com');
        expect(rows[0].raw_address).toBe('500 Admin Rd');
        expect(rows[0].subscription_status).toBe('active');
        expect(rows[0].next_service_date).toBe('2026-06-30');
    });
});
