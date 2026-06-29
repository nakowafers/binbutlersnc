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
    items: {
        data: [
            {
                current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
        ],
    },
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
                        notes: 'Waste Co',
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

        // 2. Verify lead was removed after conversion
        const lead = simulator.db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
        expect(lead).toBeUndefined();

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
        expect(address.raw_address).toBe('123 organic st');
        expect(address.trash_day).toBe('MON');
        expect(address.service_day).toBe('MON');
        expect(address.notes).toBe('Waste Co');

        expect(mockCustomerUpdate).toHaveBeenCalledWith('cus_123', {
            metadata: expect.objectContaining({
                service_address: '123 organic st',
                trash_day: 'MON',
                notes: 'Waste Co',
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
                        notes: 'Waste Co',
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
        const services = simulator.db.prepare('SELECT sh.*, s.customer_id FROM service_history sh JOIN subscriptions s ON sh.subscription_id = s.id WHERE s.customer_id = ?').all(customer.id) as any[];
        expect(services.length).toBe(1);
        expect(services[0].dispatch_status).toBe('Completed');
        expect(services[0].sales_rep_id).toBe('REP_007');
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
                        notes: 'Waste Co',
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
                        notes: 'Waste Co',
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
                        notes: 'Waste Co',
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

        mockRetrieve.mockResolvedValueOnce({ items: { data: [{ current_period_end: undefined as unknown as number }] } });

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
                        notes: 'Waste Co',
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
                        notes: 'Waste Co',
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

        const addrBefore = simulator.db.prepare('SELECT * FROM addresses WHERE raw_address = ?').get('555 upsert ln') as any;
        expect(addrBefore.trash_day).toBe('MON');

        // 2. Second conversion (same address, same email -> same customer_id, new lead)
        // This simulates a customer re-subscribing or updating info via a new checkout with same address
        const leadId2 = 'lead_upsert_2';
        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
        ).run(leadId2, 'upsert@example.com', '555 Upsert Ln', null, 0);

        const mockSession2 = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_upsert_1', // Same stripe customer
                    subscription: 'sub_upsert_2',
                    metadata: {
                        lead_id: leadId2,
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
        const addresses = simulator.db.prepare('SELECT * FROM addresses WHERE raw_address = ?').all('555 upsert ln') as any[];
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
                    items: {
                        data: [
                            {
                                current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
                            },
                        ],
                    },
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
        expect(subscription.status).toBe('canceled');
        expect(subscription.current_period_end).not.toBeNull();
    });

    it('should keep successful webhook claims when post-processing cleanup fails', async () => {
        const customerId = 'cust_cleanup_claim';
        const subscriptionId = 'sub_cleanup_claim';
        const stripeSubId = 'sub_stripe_cleanup_claim';
        const eventId = 'evt_cleanup_claim';

        simulator.db.prepare(
            'INSERT INTO customers (id, email, stripe_customer_id) VALUES (?, ?, ?)'
        ).run(customerId, 'cleanup-claim@example.com', 'cus_cleanup_claim');

        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
        ).run(subscriptionId, customerId, stripeSubId, 'active', 28);

        const originalPrepare = simulator.prepare.bind(simulator);
        simulator.prepare = ((query: string) => {
            if (query === 'DELETE FROM routific_dispatches WHERE service_date < ?') {
                throw new Error('cleanup failed');
            }
            return originalPrepare(query);
        }) as any;

        const mockEvent = {
            id: eventId,
            type: 'customer.subscription.deleted',
            data: {
                object: {
                    id: stripeSubId,
                    items: {
                        data: [
                            {
                                current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
                            },
                        ],
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(mockEvent);

        const firstRequest = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        const firstResponse = await POST(firstRequest);
        expect(firstResponse.status).toBe(200);

        const claimAfterCleanupFailure = simulator.db.prepare('SELECT * FROM webhook_events WHERE id = ?').get(eventId);
        expect(claimAfterCleanupFailure).toBeDefined();

        simulator.prepare = originalPrepare as any;

        const secondRequest = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        const secondResponse = await POST(secondRequest);
        expect(secondResponse.status).toBe(200);

        const subscription = simulator.db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(subscriptionId) as any;
        expect(subscription.status).toBe('canceled');
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

    describe('Customer identity (one-time -> subscription) hardening', () => {
        const leadBody = (leadId: string, overrides: Record<string, unknown> = {}) => ({
            id: leadId,
            email: 'identity@example.com',
            address: '123 Identity Ln',
            first_name: 'Ident',
            last_name: 'Ity',
            sales_rep_id: null,
            tos_accepted_at: null,
            converted: 0,
            created_at: new Date().toISOString(),
        });

        async function postCheckout(metadata: Record<string, string | null>, stripeCustomer: string, subscription: string | null) {
            mockConstructEventAsync.mockResolvedValue({
                type: 'checkout.session.completed',
                data: {
                    object: {
                        customer: stripeCustomer,
                        subscription: subscription,
                        metadata,
                    },
                },
            });
            await POST(new Request('http://localhost/api/webhooks/stripe', {
                method: 'POST',
                body: JSON.stringify({}),
                headers: { 'stripe-signature': 'sig_123' },
            }));
        }

        function insertLead(leadId: string, overrides: Record<string, unknown> = {}) {
            const merged = { ...leadBody(leadId), ...overrides };
            simulator.db.prepare(
                'INSERT INTO leads (id, email, address, first_name, last_name, sales_rep_id, tos_accepted_at, converted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).run(
                merged.id,
                merged.email,
                merged.address,
                merged.first_name,
                merged.last_name,
                merged.sales_rep_id ?? null,
                merged.tos_accepted_at ?? null,
                merged.converted,
                merged.created_at
            );
        }

        it('preserves D2D sales rep on a later organic subscription', async () => {
            insertLead('lead_d2d_first', {
                email: 'identity@example.com',
                sales_rep_id: 'alice',
            });
            await postCheckout({
                lead_id: 'lead_d2d_first',
                sales_rep_id: 'alice',
                phone_number: '555-1111',
                trash_day: 'MON',
                notes: '',
                bin_quantity: '1',
                frequency: 'one-time',
                tos_accepted_at: null,
            }, 'cus_d2d', null);

            // Now: same email, no rep, different lead
            insertLead('lead_org_second', {
                email: 'identity@example.com',
                sales_rep_id: null,
            });
            await postCheckout({
                lead_id: 'lead_org_second',
                phone_number: '555-2222',
                trash_day: 'TUE',
                notes: '',
                bin_quantity: '2',
                frequency: 'monthly',
                tos_accepted_at: new Date().toISOString(),
            }, 'cus_d2d', 'sub_d2d_second');

            const customers = simulator.db.prepare('SELECT * FROM customers WHERE email = ?').all('identity@example.com') as any[];
            expect(customers.length).toBe(1);
            expect(customers[0].sales_rep_id).toBe('ALICE');

            const subs = simulator.db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY rowid').all(customers[0].id) as any[];
            expect(subs.length).toBe(2);
            expect(subs.map(s => s.status).sort()).toEqual(['active', 'one-time']);
        });

        it('preserves first TOS acceptance across later checkouts with null TOS', async () => {
            const tosTime = new Date().toISOString();
            insertLead('lead_tos_first', {
                email: 'tos@example.com',
                tos_accepted_at: tosTime,
            });
            await postCheckout({
                lead_id: 'lead_tos_first',
                phone_number: '555-1111',
                trash_day: 'MON',
                notes: '',
                bin_quantity: '1',
                frequency: 'one-time',
                tos_accepted_at: tosTime,
            }, 'cus_tos', null);

            insertLead('lead_tos_second', {
                email: 'tos@example.com',
                tos_accepted_at: null,
            });
            await postCheckout({
                lead_id: 'lead_tos_second',
                phone_number: '555-1111',
                trash_day: 'MON',
                notes: '',
                bin_quantity: '1',
                frequency: 'monthly',
                tos_accepted_at: null,
            }, 'cus_tos', 'sub_tos_second');

            const customers = simulator.db.prepare('SELECT * FROM customers WHERE email = ?').all('tos@example.com') as any[];
            expect(customers.length).toBe(1);
            expect(customers[0].tos_accepted_at).toBe(tosTime);
        });

        it('dedupes customers when email casing differs', async () => {
            insertLead('lead_case_first', {
                email: 'mixedcase@example.com',
                sales_rep_id: null,
            });
            await postCheckout({
                lead_id: 'lead_case_first',
                phone_number: '555-1111',
                trash_day: 'MON',
                notes: '',
                bin_quantity: '1',
                frequency: 'one-time',
                tos_accepted_at: null,
            }, 'cus_case', null);

            // The webhook normalizes defensively, so a different case in the
            // stored lead must still resolve to the same customer.
            insertLead('lead_case_second', {
                email: 'MIXEDCASE@EXAMPLE.COM',
                sales_rep_id: null,
            });
            await postCheckout({
                lead_id: 'lead_case_second',
                phone_number: '555-1111',
                trash_day: 'TUE',
                notes: '',
                bin_quantity: '1',
                frequency: 'monthly',
                tos_accepted_at: new Date().toISOString(),
            }, 'cus_case', 'sub_case_second');

            const customers = simulator.db.prepare('SELECT * FROM customers').all() as any[];
            const allEmails = customers.map(c => c.email);
            // Both should be the canonical lowercase form.
            expect(allEmails.filter(e => e && e.toLowerCase() === 'mixedcase@example.com').length).toBe(1);
        });

        it('dedupes addresses when whitespace differs', async () => {
            insertLead('lead_addr_first', {
                email: 'addr@example.com',
                address: '123 Identity Ln',
            });
            await postCheckout({
                lead_id: 'lead_addr_first',
                phone_number: '555-1111',
                trash_day: 'MON',
                notes: '',
                bin_quantity: '1',
                frequency: 'one-time',
                tos_accepted_at: null,
            }, 'cus_addr', null);

            insertLead('lead_addr_second', {
                email: 'addr@example.com',
                address: '  123 IDENTITY LN  ',
            });
            await postCheckout({
                lead_id: 'lead_addr_second',
                phone_number: '555-1111',
                trash_day: 'TUE',
                notes: '',
                bin_quantity: '2',
                frequency: 'monthly',
                tos_accepted_at: new Date().toISOString(),
            }, 'cus_addr', 'sub_addr_second');

            const addrs = simulator.db.prepare('SELECT * FROM addresses WHERE customer_id IN (SELECT id FROM customers WHERE email = ?)').all('addr@example.com') as any[];
            expect(addrs.length).toBe(1);
            // Whitespace must be collapsed, not just trimmed.
            expect(addrs[0].raw_address).toBe('123 identity ln');
        });
    });
});
