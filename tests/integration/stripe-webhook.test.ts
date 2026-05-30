import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../src/app/api/webhooks/stripe/route';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { DbSimulator } from './db-simulator';

const mockConstructEventAsync = vi.fn();
const mockCustomerUpdate = vi.fn();

// Mock Cloudflare context
vi.mock('@cloudflare/next-on-pages', () => ({
    getRequestContext: vi.fn(),
}));

const mockRetrieve = vi.fn().mockResolvedValue({
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
});

vi.mock('stripe', () => {
    const StripeMock = function() {
        return {
            webhooks: {
                constructEventAsync: mockConstructEventAsync,
            },
            subscriptions: {
                retrieve: mockRetrieve,
            },
            customers: {
                update: mockCustomerUpdate,
            },
        };
    };
    StripeMock.createSubtleCryptoProvider = () => ({
        computeHMACSignature: vi.fn(),
        computeHMACSignatureAsync: vi.fn(),
    });
    return {
        default: StripeMock,
    };
});

describe('Stripe Webhook - Integration Tests with SQLite', () => {
    let simulator: DbSimulator;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockCustomerUpdate.mockResolvedValue({});

        // Use the real SQLite-backed database simulator
        simulator = new DbSimulator();

        mockEnv = {
            DB: simulator,
            STRIPE_SECRET_KEY: 'sk_test_123',
            STRIPE_WEBHOOK_SECRET: 'whsec_123',
        };

        (getRequestContext as any).mockReturnValue({ env: mockEnv });
    });

    it('should NOT create an initial service record for Organic signups (no sales_rep_id) and insert correct fields', async () => {
        const leadId = 'lead_123';
        
        // 1. Seed the DB with the lead
        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId, 'organic@example.com', '123 Organic St', null, 0);

        const mockSession = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_123',
                    subscription: 'sub_123',
                    metadata: {
                        lead_id: leadId,
                        phone_number: '555-5555',
                        trash_day: 'MON',
                        provider_name: 'Waste Co',
                        bin_quantity: '2',
                        frequency: 'monthly',
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(mockSession);

        const request = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        // 2. Query and verify lead conversion
        const lead = simulator.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId) as any;
        expect(lead.converted).toBe(1);

        // 3. Query and verify customer insertion
        const customer = simulator.db.prepare('SELECT * FROM customers WHERE email = ?').get('organic@example.com') as any;
        expect(customer).toBeDefined();
        expect(customer.stripe_customer_id).toBe('cus_123');
        expect(customer.phone_number).toBe('555-5555');
        expect(customer.bin_quantity).toBe(2);
        expect(customer.sales_rep_id).toBeNull();

        // 4. Query and verify address insertion with populated customer_id
        const address = simulator.db.prepare('SELECT * FROM addresses WHERE id = ?').get(customer.address_id) as any;
        expect(address).toBeDefined();
        expect(address.customer_id).toBe(customer.id);
        expect(address.raw_address).toBe('123 Organic St');
        expect(address.trash_day).toBe('MON');
        expect(address.service_day).toBe('MON');
        expect(address.provider_name).toBe('Waste Co');

        expect(mockCustomerUpdate).toHaveBeenCalledWith('cus_123', {
            metadata: expect.objectContaining({
                service_address: '123 Organic St',
                trash_day: 'MON',
                provider_name: 'Waste Co',
                phone_number: '555-5555',
            }),
        });

        // 5. Query and verify subscription insertion
        const subscription = simulator.db.prepare('SELECT * FROM subscriptions WHERE customer_id = ?').get(customer.id) as any;
        expect(subscription).toBeDefined();
        expect(subscription.stripe_subscription_id).toBe('sub_123');
        expect(subscription.status).toBe('active');
        expect(subscription.frequency_days).toBe(28);

        // 6. Verify service_history is empty
        const services = simulator.db.prepare('SELECT * FROM service_history').all();
        expect(services.length).toBe(0);
    });

    it('should create an immediate service record for D2D signups (with sales_rep_id)', async () => {
        const leadId = 'lead_456';

        // Seed the DB
        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId, 'd2d@example.com', '456 D2D Ave', 'REP_007', 0);

        const mockSession = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_456',
                    subscription: 'sub_456',
                    metadata: {
                        lead_id: leadId,
                        sales_rep_id: 'REP_007',
                        phone_number: '555-5555',
                        trash_day: 'TUE',
                        provider_name: 'Waste Co',
                        bin_quantity: '1',
                        frequency: 'monthly',
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(mockSession);

        const request = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        // Query customer
        const customer = simulator.db.prepare('SELECT * FROM customers WHERE email = ?').get('d2d@example.com') as any;
        expect(customer).toBeDefined();

        // Verify service_history has 1 completed record
        const services = simulator.db.prepare('SELECT * FROM service_history WHERE customer_id = ?').all(customer.id) as any[];
        expect(services.length).toBe(1);
        expect(services[0].dispatch_status).toBe('Completed');
        expect(services[0].sales_rep_id).toBe('REP_007');

        // Verify subscription has last_service_date set to current time
        const subscription = simulator.db.prepare('SELECT * FROM subscriptions WHERE customer_id = ?').get(customer.id) as any;
        expect(subscription.last_service_date).toBeDefined();
        expect(subscription.last_service_date).not.toBeNull();
    });

    it('should fail checkout webhook processing if Stripe customer service details cannot be mirrored', async () => {
        const leadId = 'lead_customer_update';

        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId, 'customer-update@example.com', '987 Metadata Ave', null, 0);

        mockCustomerUpdate.mockRejectedValueOnce(new Error('Stripe customer update failed'));

        const event = {
            id: 'evt_customer_update_fail',
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_customer_update',
                    subscription: 'sub_customer_update',
                    metadata: {
                        lead_id: leadId,
                        phone_number: '555-8989',
                        trash_day: 'FRI',
                        provider_name: 'Waste Co',
                        bin_quantity: '1',
                        frequency: 'monthly',
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(event);

        const response = await POST(new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        }));

        expect(response.status).toBe(502);

        const customer = simulator.db.prepare('SELECT * FROM customers WHERE email = ?').get('customer-update@example.com');
        expect(customer).toBeUndefined();

        const lead = simulator.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId) as any;
        expect(lead.converted).toBe(0);
    });

    it('should allow a failed checkout webhook to be retried after the missing lead is created', async () => {
        const leadId = 'lead_retry';
        const event = {
            id: 'evt_retry_missing_lead',
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_retry',
                    subscription: 'sub_retry',
                    metadata: {
                        lead_id: leadId,
                        phone_number: '555-1212',
                        trash_day: 'THU',
                        provider_name: 'Waste Co',
                        bin_quantity: '1',
                        frequency: 'monthly',
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(event);

        const firstResponse = await POST(new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        }));
        expect(firstResponse.status).toBe(404);

        let customer = simulator.db.prepare('SELECT * FROM customers WHERE email = ?').get('retry@example.com') as any;
        expect(customer).toBeUndefined();

        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId, 'retry@example.com', '321 Retry Ln', null, 0);

        const secondResponse = await POST(new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        }));
        expect(secondResponse.status).toBe(200);

        customer = simulator.db.prepare('SELECT * FROM customers WHERE email = ?').get('retry@example.com') as any;
        expect(customer).toBeDefined();
        expect(customer.stripe_customer_id).toBe('cus_retry');
    });

    it('should fail checkout webhook processing if subscription period lookup fails instead of writing a null end date', async () => {
        const leadId = 'lead_period_end';

        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId, 'period@example.com', '654 Period Ln', null, 0);

        mockRetrieve.mockRejectedValueOnce(new Error('Stripe unavailable'));

        const event = {
            id: 'evt_period_end_fail',
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_period',
                    subscription: 'sub_period',
                    metadata: {
                        lead_id: leadId,
                        phone_number: '555-3434',
                        trash_day: 'MON',
                        provider_name: 'Waste Co',
                        bin_quantity: '2',
                        frequency: 'monthly',
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(event);

        const response = await POST(new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        }));

        expect(response.status).toBe(502);

        const customer = simulator.db.prepare('SELECT * FROM customers WHERE email = ?').get('period@example.com');
        expect(customer).toBeUndefined();

        const subscription = simulator.db.prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?').get('sub_period');
        expect(subscription).toBeUndefined();
    });

    it('should fail checkout webhook processing if Stripe returns an invalid current_period_end value', async () => {
        const leadId = 'lead_invalid_period_end';

        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId, 'invalid-period@example.com', '999 Invalid Ln', null, 0);

        mockRetrieve.mockResolvedValueOnce({ current_period_end: undefined as unknown as number });

        const event = {
            id: 'evt_invalid_period_end',
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_invalid_period',
                    subscription: 'sub_invalid_period',
                    metadata: {
                        lead_id: leadId,
                        phone_number: '555-4444',
                        trash_day: 'THU',
                        provider_name: 'Waste Co',
                        bin_quantity: '1',
                        frequency: 'monthly',
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(event);

        const response = await POST(new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        }));

        expect(response.status).toBe(502);

        const payload = await response.json();
        expect(payload.error).toContain('did not return a valid current_period_end');
    });

    it('should correctly capture and persist tos_accepted_at from metadata', async () => {
        const leadId = 'lead_789';

        // Seed DB
        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId, 'tos@example.com', '789 ToS Rd', null, 0);

        const mockSession = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_789',
                    subscription: 'sub_789',
                    metadata: {
                        lead_id: leadId,
                        phone_number: '555-5555',
                        trash_day: 'WED',
                        provider_name: 'Waste Co',
                        bin_quantity: '1',
                        frequency: 'quarterly',
                        tos_accepted_at: '2026-05-14T01:00:00.000Z',
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(mockSession);

        const request = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        await POST(request);

        const customer = simulator.db.prepare('SELECT * FROM customers WHERE email = ?').get('tos@example.com') as any;
        expect(customer.tos_accepted_at).toBe('2026-05-14T01:00:00.000Z');
    });

    it('should correctly UPSERT addresses using ON CONFLICT(raw_address, customer_id)', async () => {
        const leadId = 'lead_upsert';
        
        // 1. Initial conversion
        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId, 'upsert@example.com', '555 Upsert Ln', null, 0);

        const mockSession1 = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_upsert_1',
                    subscription: 'sub_upsert_1',
                    metadata: {
                        lead_id: leadId,
                        phone_number: '555-0001',
                        trash_day: 'MON',
                        bin_quantity: '1',
                        frequency: 'monthly',
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(mockSession1);
        await POST(new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        }));

        const addrBefore = simulator.db.prepare('SELECT * FROM addresses WHERE raw_address = ?').get('555 Upsert Ln') as any;
        expect(addrBefore.trash_day).toBe('MON');

        // 2. Second conversion (same address, same lead/email -> same customer_id)
        // This simulates a customer re-subscribing or updating info via a new checkout with same address
        const mockSession2 = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_upsert_1', // Same stripe customer
                    subscription: 'sub_upsert_2',
                    metadata: {
                        lead_id: leadId,
                        phone_number: '555-0002',
                        trash_day: 'TUE', // Updated trash day
                        bin_quantity: '2',
                        frequency: 'monthly',
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(mockSession2);
        await POST(new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        }));

        // Verify address was updated, not duplicated
        const addresses = simulator.db.prepare('SELECT * FROM addresses WHERE raw_address = ?').all('555 Upsert Ln') as any[];
        expect(addresses.length).toBe(1);
        expect(addresses[0].trash_day).toBe('TUE');
        expect(addresses[0].service_day).toBe('TUE');
    });

    it('should handle customer.subscription.deleted by updating subscription status to cancelled', async () => {
        const customerId = 'cust_sub_del';
        const subscriptionId = 'sub_del';
        const stripeSubId = 'sub_stripe_deleted';

        // Seed customer and subscription
        simulator.db.prepare(
            'INSERT INTO customers (id, email, stripe_customer_id) VALUES (?, ?, ?)'
        ).run(customerId, 'sub_del@example.com', 'cus_sub_del');

        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
        ).run(subscriptionId, customerId, stripeSubId, 'active', 28);

        const mockEvent = {
            type: 'customer.subscription.deleted',
            data: {
                object: {
                    id: stripeSubId,
                    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(mockEvent);

        const request = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        // Verify status and current_period_end in DB are updated
        const subscription = simulator.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId) as any;
        expect(subscription.status).toBe('cancelled');
        expect(subscription.current_period_end).not.toBeNull();
    });

    it('should handle invoice.payment_failed by updating subscription status to past_due', async () => {
        const customerId = 'cust_payment_fail';
        const subscriptionId = 'sub_pay_fail';
        const stripeSubId = 'sub_stripe_fail';

        // Seed customer and subscription
        simulator.db.prepare(
            'INSERT INTO customers (id, email, stripe_customer_id) VALUES (?, ?, ?)'
        ).run(customerId, 'pay_fail@example.com', 'cus_pay_fail');

        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
        ).run(subscriptionId, customerId, stripeSubId, 'active', 28);

        const mockEvent = {
            type: 'invoice.payment_failed',
            data: {
                object: {
                    subscription: stripeSubId,
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(mockEvent);

        const request = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        // Verify status in DB is past_due
        const subscription = simulator.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId) as any;
        expect(subscription.status).toBe('past_due');
    });
});
