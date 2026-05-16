import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../src/app/api/webhooks/stripe/route';
import { getRequestContext } from '@cloudflare/next-on-pages';
import Stripe from 'stripe';

const mockConstructEventAsync = vi.fn();

// Mock Cloudflare context
vi.mock('@cloudflare/next-on-pages', () => ({
    getRequestContext: vi.fn(),
}));

// Mock Stripe
vi.mock('stripe', () => {
    return {
        default: function() {
            return {
                webhooks: {
                    constructEventAsync: mockConstructEventAsync,
                },
            };
        },
    };
});

// Mock Resend
vi.mock('resend', () => ({
    Resend: function() {
        return {
            emails: {
                send: vi.fn().mockResolvedValue({ id: 'test-email-id' }),
            },
        };
    },
}));

describe('Stripe Webhook - D2D vs Organic Fulfillment', () => {
    let mockDb: any;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockDb = {
            prepare: vi.fn().mockReturnThis(),
            bind: vi.fn().mockReturnThis(),
            first: vi.fn(),
            run: vi.fn().mockResolvedValue({ success: true }),
            batch: vi.fn().mockResolvedValue([]),
        };

        mockEnv = {
            DB: mockDb,
            STRIPE_SECRET_KEY: 'sk_test_123',
            STRIPE_WEBHOOK_SECRET: 'whsec_123',
            RESEND_API_KEY: 're_123',
        };

        (getRequestContext as any).mockReturnValue({ env: mockEnv });
    });

    it('should NOT create an initial service record for Organic signups (no sales_rep_id)', async () => {
        const mockSession = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_123',
                    subscription: 'sub_123',
                    metadata: {
                        lead_id: 'lead_123',
                        phone_number: '555-5555',
                        trash_day: 'MON',
                        provider_name: 'Waste Co',
                        bin_quantity: '2',
                        frequency: 'monthly',
                        // sales_rep_id is missing
                    },
                },
            },
        };

        mockConstructEventAsync.mockResolvedValue(mockSession);

        // Mock lead lookup
        mockDb.first.mockResolvedValue({
            id: 'lead_123',
            email: 'organic@example.com',
            address: '123 Organic St',
        });

        const request = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        await POST(request);

        // Verify batch statements
        expect(mockDb.batch).toHaveBeenCalled();
        const batchStatements = mockDb.batch.mock.calls[0][0];

        // Should have 4 statements: update lead, create address, create customer, create subscription
        // but NOT create service_history
        expect(batchStatements.length).toBe(4);

        // Check that none of the prepared statements involve service_history
        const sqlCalls = mockDb.prepare.mock.calls.map(call => call[0]);
        const hasServiceHistory = sqlCalls.some(sql => sql.includes('INSERT INTO service_history'));
        expect(hasServiceHistory).toBe(false);
    });

    it('should create an immediate service record for D2D signups (with sales_rep_id)', async () => {
        const mockSession = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_456',
                    subscription: 'sub_456',
                    metadata: {
                        lead_id: 'lead_456',
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

        // Mock lead lookup
        mockDb.first.mockResolvedValue({
            id: 'lead_456',
            email: 'd2d@example.com',
            address: '456 D2D Ave',
        });

        const request = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        await POST(request);

        // Verify batch statements
        expect(mockDb.batch).toHaveBeenCalled();
        const batchStatements = mockDb.batch.mock.calls[0][0];

        // Should have 5 statements: update lead, create address, create customer, create subscription, AND create service_history
        expect(batchStatements.length).toBe(5);

        // Check that one of the prepared statements IS service_history
        const sqlCalls = mockDb.prepare.mock.calls.map(call => call[0]);
        const hasServiceHistory = sqlCalls.some(sql => sql.includes('INSERT INTO service_history'));
        expect(hasServiceHistory).toBe(true);
    });

    it('should correctly capture and persist tos_accepted_at from metadata', async () => {
        const mockSession = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    customer: 'cus_789',
                    subscription: 'sub_789',
                    metadata: {
                        lead_id: 'lead_789',
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

        mockDb.first.mockResolvedValue({
            id: 'lead_789',
            email: 'tos@example.com',
            address: '789 ToS Rd',
        });

        const request = new Request('http://localhost/api/webhooks/stripe', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'stripe-signature': 'sig_123' },
        });

        await POST(request);

        // Verify customer insertion includes ToS timestamp
        const customerInsertCall = mockDb.prepare.mock.calls.find(
            call => call[0].includes('INSERT INTO customers')
        );
        expect(customerInsertCall).toBeDefined();

        // Find the bind call for this prepare
        const bindCall = mockDb.bind.mock.calls.find(
            call => {
                // This is a bit tricky with ReturnThis mocks, but we can look for the timestamp in arguments
                return call.includes('2026-05-14T01:00:00.000Z');
            }
        );
        expect(bindCall).toBeDefined();
    });
});
