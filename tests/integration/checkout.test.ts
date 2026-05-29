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
    return {
        default: function() {
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
        },
    };
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
            address: '123 Test St',
            phone_number: '555-1234',
            trash_day: 'MON',
            provider_name: 'Waste Co',
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
        expect(lead.address).toBe('123 Test St');
        expect(lead.tos_accepted_at).toBeDefined();

        // 2. Verify Stripe session creation
        expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            customer_email: 'test@example.com',
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
            address: '456 Onetime Rd',
            phone_number: '555-0000',
            trash_day: 'FRI',
            provider_name: 'City Waste',
            bin_quantity: 1,
            frequency: 'one-time',
            setup_fee_override: 50,
        };

        const request = new Request('http://localhost/api/checkout', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        // Verify Stripe session for one-time payment
        expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
            mode: 'payment',
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
});
