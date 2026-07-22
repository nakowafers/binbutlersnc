import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../src/app/api/webhooks/stripe/route';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { DbSimulator } from './db-simulator';
import { today, futureDate } from '../test-utils';

const mockConstructEventAsync = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockRetrieve = vi.fn().mockResolvedValue({
    items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 }] },
});

// Mock Cloudflare context
vi.mock('@cloudflare/next-on-pages', () => ({
    getRequestContext: vi.fn(),
}));

vi.mock('stripe', () => {
    const StripeMock = function () {
        return {
            webhooks: { constructEventAsync: mockConstructEventAsync },
            subscriptions: { retrieve: mockRetrieve },
            customers: { update: mockCustomerUpdate },
        };
    };
    StripeMock.createSubtleCryptoProvider = () => ({
        computeHMACSignature: vi.fn(),
        computeHMACSignatureAsync: vi.fn(),
    });
    return { default: StripeMock };
});

function seedLead(simulator: DbSimulator, id: string, email: string, address: string, salesRepId: string | null) {
    simulator.db.prepare(
        'INSERT INTO leads (id, email, address, sales_rep_id, converted) VALUES (?, ?, ?, ?, ?)'
    ).run(id, email, address, salesRepId, 0);
}

function createEvent(leadId: string, overrides: Record<string, string> = {}) {
    const frequency = overrides.frequency || 'monthly';
    const isSubscription = frequency !== 'one-time';
    return {
        type: 'checkout.session.completed',
        data: {
            object: {
                customer: 'cus_' + leadId,
                ...(isSubscription ? { subscription: 'sub_' + leadId } : {}),
                metadata: {
                    lead_id: leadId,
                    phone_number: '555-1234',
                    trash_day: 'MON',
                    notes: 'Waste Co',
                    bin_quantity: '1',
                    frequency,
                    scent_preference: 'lavender',
                    ...overrides,
                },
            },
        },
    };
}

async function processWebhook(simulator: DbSimulator, event: any): Promise<Response> {
    mockConstructEventAsync.mockResolvedValue(event);
    const request = new Request('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'stripe-signature': 'sig_123' },
    });
    return await POST(request);
}

function getServiceRecords(simulator: DbSimulator): any[] {
    return simulator.db.prepare('SELECT * FROM service_history').all() as any[];
}

function getCustomer(simulator: DbSimulator, email: string): any {
    return simulator.db.prepare('SELECT * FROM customers WHERE email = ?').get(email) as any;
}

function getSubscription(simulator: DbSimulator, customerId: string): any {
    return simulator.db.prepare('SELECT * FROM subscriptions WHERE customer_id = ?').get(customerId) as any;
}

describe('Next Service Date - Webhook Integration', () => {
    let simulator: DbSimulator;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockCustomerUpdate.mockResolvedValue({});
        simulator = new DbSimulator();

        mockEnv = {
            DB: simulator,
            STRIPE_SECRET_KEY: 'sk_test_123',
            STRIPE_WEBHOOK_SECRET: 'whsec_123',
        };

        (getRequestContext as any).mockReturnValue({ env: mockEnv });
    });

    describe('Subscription + same-day next_service_date', () => {
        it('stores the date on the subscription without creating service_history for organic onboarding', async () => {
            const leadId = 'lead_sameday_sub';
            seedLead(simulator, leadId, 'sameday-sub@example.com', '101 SameDay Sub St', null);

            const event = createEvent(leadId, {
                next_service_date: today(),
            });

            const response = await processWebhook(simulator, event);
            expect(response.status).toBe(200);

            const customer = getCustomer(simulator, 'sameday-sub@example.com');
            const sub = getSubscription(simulator, customer.id);
            expect(sub.next_service_date).toBe(today());

            const services = getServiceRecords(simulator);
            expect(services).toHaveLength(0);
        });
    });

    describe('Subscription + future next_service_date', () => {
        it('stores the date on the subscription without creating service_history', async () => {
            const leadId = 'lead_future_sub';
            const future = futureDate(14);
            seedLead(simulator, leadId, 'future-sub@example.com', '202 Future Sub Ave', null);

            const event = createEvent(leadId, {
                next_service_date: future,
            });

            const response = await processWebhook(simulator, event);
            expect(response.status).toBe(200);

            const customer = getCustomer(simulator, 'future-sub@example.com');
            const sub = getSubscription(simulator, customer.id);
            expect(sub.next_service_date).toBe(future);

            const services = getServiceRecords(simulator);
            expect(services).toHaveLength(0);
        });
    });

    describe('One-time + same-day next_service_date', () => {
        it('stores the date on the subscription without creating service_history for organic onboarding', async () => {
            const leadId = 'lead_sameday_ot';
            seedLead(simulator, leadId, 'sameday-ot@example.com', '303 SameDay OT Blvd', null);

            const event = createEvent(leadId, {
                frequency: 'one-time',
                next_service_date: today(),
            });

            const response = await processWebhook(simulator, event);
            expect(response.status).toBe(200);

            const customer = getCustomer(simulator, 'sameday-ot@example.com');
            const sub = getSubscription(simulator, customer.id);
            expect(sub.frequency_days).toBe(0);
            expect(sub.status).toBe('one-time');
            expect(sub.next_service_date).toBe(today());

            const services = getServiceRecords(simulator);
            expect(services).toHaveLength(0);
        });
    });

    describe('One-time + future next_service_date', () => {
        it('stores the date on the subscription without creating service_history', async () => {
            const leadId = 'lead_future_ot';
            const future = futureDate(10);
            seedLead(simulator, leadId, 'future-ot@example.com', '404 Future OT Ct', null);

            const event = createEvent(leadId, {
                frequency: 'one-time',
                next_service_date: future,
            });

            const response = await processWebhook(simulator, event);
            expect(response.status).toBe(200);

            const customer = getCustomer(simulator, 'future-ot@example.com');
            const sub = getSubscription(simulator, customer.id);
            expect(sub.frequency_days).toBe(0);
            expect(sub.status).toBe('one-time');
            expect(sub.next_service_date).toBe(future);

            const services = getServiceRecords(simulator);
            expect(services).toHaveLength(0);
        });
    });

    describe('D2D with next_service_date', () => {
        it('should create Completed for D2D with same-day date', async () => {
            const leadId = 'lead_d2d_sameday';
            seedLead(simulator, leadId, 'd2d-sameday@example.com', '505 D2D SameDay Rd', 'REP_001');

            const event = createEvent(leadId, {
                sales_rep_id: 'REP_001',
                next_service_date: today(),
            });

            const response = await processWebhook(simulator, event);
            expect(response.status).toBe(200);

            const services = getServiceRecords(simulator);
            expect(services.length).toBe(1);
            expect(services[0].dispatch_status).toBe('Completed');
            expect(services[0].sales_rep_id).toBe('REP_001');
            expect(services[0].service_date).toContain(today());
        });

        it('creates immediate Completed history for D2D and does not schedule the future date', async () => {
            const leadId = 'lead_d2d_future';
            const future = futureDate(7);
            seedLead(simulator, leadId, 'd2d-future@example.com', '606 D2D Future Ln', 'REP_002');

            const event = createEvent(leadId, {
                sales_rep_id: 'REP_002',
                next_service_date: future,
            });

            const response = await processWebhook(simulator, event);
            expect(response.status).toBe(200);

            const customer = getCustomer(simulator, 'd2d-future@example.com');
            const sub = getSubscription(simulator, customer.id);
            expect(sub.next_service_date).toBeNull();

            const services = getServiceRecords(simulator);
            expect(services.length).toBe(1);
            expect(services[0].dispatch_status).toBe('Completed');
            expect(services[0].sales_rep_id).toBe('REP_002');
            expect(services[0].service_date).toContain(today());
        });
    });

    describe('No next_service_date (backward compat)', () => {
        it('should create zero service_history for organic signups without next_service_date', async () => {
            const leadId = 'lead_no_nsd_organic';
            seedLead(simulator, leadId, 'no-nsd@example.com', '707 Legacy Organic St', null);

            const event = createEvent(leadId);

            const response = await processWebhook(simulator, event);
            expect(response.status).toBe(200);

            const services = getServiceRecords(simulator);
            expect(services.length).toBe(0);
        });

        it('should create immediate Completed for D2D without next_service_date', async () => {
            const leadId = 'lead_no_nsd_d2d';
            seedLead(simulator, leadId, 'no-nsd-d2d@example.com', '808 Legacy D2D Ave', 'REP_003');

            const event = createEvent(leadId, {
                sales_rep_id: 'REP_003',
            });

            const response = await processWebhook(simulator, event);
            expect(response.status).toBe(200);

            const services = getServiceRecords(simulator);
            expect(services.length).toBe(1);
            expect(services[0].dispatch_status).toBe('Completed');
            expect(services[0].sales_rep_id).toBe('REP_003');
            expect(services[0].service_date).toContain(today());
        });
    });

    describe('Quarterly subscription with next_service_date', () => {
        it('should create subscription with frequency_days=84 and correct next_service_date', async () => {
            const leadId = 'lead_quarterly';
            const future = futureDate(30);
            seedLead(simulator, leadId, 'quarterly@example.com', '909 Quarterly Blvd', null);

            const event = createEvent(leadId, {
                frequency: 'quarterly',
                next_service_date: future,
            });

            const response = await processWebhook(simulator, event);
            expect(response.status).toBe(200);

            const customer = getCustomer(simulator, 'quarterly@example.com');
            const sub = getSubscription(simulator, customer.id);
            expect(sub.frequency_days).toBe(84);
            expect(sub.next_service_date).toBe(future);

            const services = getServiceRecords(simulator);
            expect(services).toHaveLength(0);
        });
    });
});
