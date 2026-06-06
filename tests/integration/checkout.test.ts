import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../src/app/api/checkout/route';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { DbSimulator } from './db-simulator';

const mockCreateSession = vi.fn();
const mockRetrievePrice = vi.fn();

// Mock Cloudflare context
vi.mock('@cloudflare/next-on-pages', () => ({
    getRequestContext: vi.fn(),
}));

// Mock Stripe
const mockCustomerList = vi.fn();
vi.mock('stripe', () => {
    const StripeMock = function() {
        return {
            checkout: {
                sessions: {
                    create: mockCreateSession,
                },
            },
            prices: {
                retrieve: mockRetrievePrice,
            },
            customers: {
                list: mockCustomerList,
            },
        };
    };
    StripeMock.createSubtleCryptoProvider = () => ({
        computeHMACSignature: vi.fn(),
        computeHMACSignatureAsync: vi.fn(),
    });
    return { default: StripeMock };
});

describe('Checkout API - Integration Tests', () => {
    let simulator: DbSimulator;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockCustomerList.mockResolvedValue({ data: [] });

        simulator = new DbSimulator();

        mockEnv = {
            DB: simulator,
            STRIPE_SECRET_KEY: 'sk_test_123',
            STRIPE_MONTHLY_PRICE_ID: 'price_monthly',
            STRIPE_QUARTERLY_PRICE_ID: 'price_quarterly',
            STRIPE_ONETIME_PRICE_ID: 'price_onetime',
            STRIPE_SETUP_FEE_PRICE_ID: 'price_setup',
        };

        (getRequestContext as any).mockReturnValue({ env: mockEnv });
    });

    it('should create a lead and a Stripe session for monthly frequency', async () => {
        mockCreateSession.mockResolvedValue({ url: 'https://stripe.com/checkout/session/123' });
        mockRetrievePrice.mockResolvedValue({ product: 'prod_setup' });

        const body = {
            email: 'test@example.com',
            first_name: 'John',
            last_name: 'Doe',
            address: '123 Test St',
            phone_number: '555-1234',
            trash_day: 'MON',
            notes: 'Waste Co',
            bin_quantity: 2,
            frequency: 'monthly',
            tos_accepted: true,
            age_confirmed: true,
            contact_consent: true,
        };

        const request = new Request('http://localhost/api/checkout', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.url).toBe('https://stripe.com/checkout/session/123');

        // 1. Verify lead insertion
        const lead = simulator.db.prepare('SELECT * FROM leads WHERE email = ?').get('test@example.com') as any;
        expect(lead).toBeDefined();
        expect(lead.address).toBe('123 test st');
        expect(lead.tos_accepted_at).toBeDefined();

        // 2. Verify Stripe session creation
        expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            customer_email: 'test@example.com',
            customer_creation: undefined,
            mode: 'subscription',
            line_items: [
                { price: 'price_monthly', quantity: 1 },
                { price: 'price_setup', quantity: 1 }
            ],
            metadata: expect.objectContaining({
                phone_number: '555-1234',
                trash_day: 'MON',
                frequency: 'monthly',
            }),
        }));
    });

    it('should handle one-time frequency and custom setup fee override', async () => {
        mockCreateSession.mockResolvedValue({ url: 'https://stripe.com/checkout/session/456' });
        mockRetrievePrice.mockResolvedValue({ product: 'prod_onetime' });
        mockCustomerList.mockResolvedValue({ data: [] });

        const body = {
            email: 'onetime@example.com',
            first_name: 'Jane',
            last_name: 'Smith',
            address: '456 Onetime Rd',
            phone_number: '555-0000',
            trash_day: 'FRI',
            notes: 'City Waste',
            bin_quantity: 1,
            frequency: 'one-time',
            sales_rep_id: 'rep_override',
            setup_fee_override: 50,
        };
        simulator.db.prepare('INSERT INTO sales_reps (id, can_override_fee) VALUES (?, ?)')
            .run('rep_override', 1);

        const request = new Request('http://localhost/api/checkout', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        // Verify Stripe session for one-time payment
        expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'payment',
            customer_creation: 'always',
            line_items: [
                expect.objectContaining({
                    price_data: expect.objectContaining({
                        unit_amount: 5000,
                    })
                })
            ],
        }));
    });

    it('should return 400 for invalid data', async () => {
        const body = {
            email: 'invalid-email',
            address: 'too-short',
        };

        const request = new Request('http://localhost/api/checkout', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
    });

    it('should accept valid next_service_date with subscription', async () => {
        mockCreateSession.mockResolvedValue({ url: 'https://stripe.com/checkout/session/789' });
        mockRetrievePrice.mockResolvedValue({ product: 'prod_setup' });

        const body = {
            email: 'date-test@example.com',
            first_name: 'Date',
            last_name: 'Test',
            address: '777 Date Pick Ln',
            phone_number: '555-7777',
            trash_day: 'WED',
            notes: 'Waste Co',
            bin_quantity: 1,
            frequency: 'monthly',
            tos_accepted: true,
            age_confirmed: true,
            contact_consent: true,
            next_service_date: '2026-06-17',
        };

        const request = new Request('http://localhost/api/checkout', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'subscription',
            metadata: expect.objectContaining({
                next_service_date: '2026-06-17',
            }),
            subscription_data: expect.objectContaining({
                trial_end: 1784159999,
            }),
        }));
    });

    it('should accept next_service_date with one-time frequency', async () => {
        mockCreateSession.mockResolvedValue({ url: 'https://stripe.com/checkout/session/101' });
        mockRetrievePrice.mockResolvedValue({ product: 'prod_onetime' });

        const body = {
            email: 'ot-date@example.com',
            first_name: 'OT',
            last_name: 'Date',
            address: '888 OT Date Dr',
            phone_number: '555-8888',
            trash_day: 'FRI',
            notes: 'Waste Co',
            bin_quantity: 1,
            frequency: 'one-time',
            next_service_date: '2026-06-19',
        };

        const request = new Request('http://localhost/api/checkout', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'payment',
            metadata: expect.objectContaining({
                next_service_date: '2026-06-19',
            }),
        }));
    });

    it('should reuse an existing lead by normalized email and refresh its metadata', async () => {
        mockCreateSession.mockResolvedValue({ url: 'https://stripe.com/checkout/session/reused' });
        mockRetrievePrice.mockResolvedValue({ product: 'prod_setup' });

        simulator.db.prepare(
            'INSERT INTO leads (id, email, address, first_name, last_name, sales_rep_id, tos_accepted_at, converted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
            'existing_lead_1',
            'reuse@example.com',
            '123 Old St',
            'Jane',
            'Doe',
            'alice',
            null,
            0,
            new Date().toISOString()
        );

        const body = {
            email: '  REUSE@Example.COM  ',
            first_name: 'Janet',
            last_name: 'Doe',
            address: '  123 New St  ',
            phone_number: '555-9999',
            trash_day: 'WED',
            notes: 'updated',
            bin_quantity: 3,
            frequency: 'monthly',
            tos_accepted: true,
            age_confirmed: true,
            contact_consent: true,
        };

        const request = new Request('http://localhost/api/checkout', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const leads = simulator.db.prepare('SELECT * FROM leads WHERE email = ?').all('reuse@example.com') as any[];
        expect(leads.length).toBe(1);
        expect(leads[0].id).toBe('existing_lead_1');

        expect(leads[0].first_name).toBe('Janet');
        expect(leads[0].last_name).toBe('Doe');
        expect(leads[0].address).toBe('123 new st');
        expect(leads[0].sales_rep_id).toBe('alice');
        expect(leads[0].tos_accepted_at).toBeTruthy();

        expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            customer_email: 'reuse@example.com',
        }));
    });
});
