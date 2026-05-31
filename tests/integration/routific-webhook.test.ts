import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../src/app/api/webhooks/routific/route';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { DbSimulator } from './db-simulator';

// Mock Cloudflare context
vi.mock('@cloudflare/next-on-pages', () => ({
    getRequestContext: vi.fn(),
}));

async function computeHmac(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const WEBHOOK_SECRET = 'test-secret';

describe('Routific Webhook - Integration Tests', () => {
    let simulator: DbSimulator;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Use the real SQLite-backed database simulator
        simulator = new DbSimulator();

        mockEnv = {
            DB: simulator,
            ROUTIFIC_WEBHOOK_SECRET: WEBHOOK_SECRET,
        };

        (getRequestContext as any).mockReturnValue({ env: mockEnv });
    });

    it('should update service_history and subscription on stop.completed event', async () => {
        const subId = 'sub_123';
        const customerId = 'cust_123';

        // 1. Seed data
        // Create customer
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run(customerId, 'test@example.com');

        // Create subscription
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, status, frequency_days) VALUES (?, ?, ?, ?)'
        ).run(subId, customerId, 'active', 28);

        // Create pending service history
        simulator.db.prepare(
            'INSERT INTO service_history (id, subscription_id, dispatch_status, service_date) VALUES (?, ?, ?, ?)'
        ).run('srv_123', subId, 'Pending', '2025-01-01T00:00:00Z');

        const payload = {
            event: 'stop.completed',
            data: {
                id: 'routific_stop_123',
                customer_id: customerId,
                subscription_id: subId,
                completed_at: '2025-02-01T10:00:00Z'
            }
        };

        const bodyStr = JSON.stringify(payload);
        const signature = await computeHmac(bodyStr, WEBHOOK_SECRET);

        const request = new Request('http://localhost/api/webhooks/routific', {
            method: 'POST',
            body: bodyStr,
            headers: {
                'Content-Type': 'application/json',
                'x-routific-signature': signature,
            },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        // 2. Verify updates
        const service = simulator.db.prepare('SELECT * FROM service_history WHERE subscription_id = ?').get(subId) as any;
        expect(service.dispatch_status).toBe('Completed');
        expect(service.service_date).toBe('2025-02-01T10:00:00Z');

    });

    it('should handle missing completed_at', async () => {
        const subId = 'sub_456';
        const customerId = 'cust_456';

        // 1. Seed data
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run(customerId, 'test2@example.com');

        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, status, frequency_days) VALUES (?, ?, ?, ?)'
        ).run(subId, customerId, 'active', 28);

        simulator.db.prepare(
            'INSERT INTO service_history (id, subscription_id, dispatch_status, service_date) VALUES (?, ?, ?, ?)'
        )            .run('srv_456', subId, 'Pending', '2025-01-01T00:00:00Z');

        const payload = {
            event: 'stop.completed',
            data: {
                id: 'routific_stop_456',
                customer_id: customerId,
                subscription_id: subId
            }
        };

        const bodyStr = JSON.stringify(payload);
        const signature = await computeHmac(bodyStr, WEBHOOK_SECRET);

        const request = new Request('http://localhost/api/webhooks/routific', {
            method: 'POST',
            body: bodyStr,
            headers: {
                'Content-Type': 'application/json',
                'x-routific-signature': signature,
            },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const service = simulator.db.prepare('SELECT * FROM service_history WHERE subscription_id = ?').get(subId) as any;
        expect(service.dispatch_status).toBe('Completed');

    });

    it('should handle stop.skipped event by updating service_history to Skipped', async () => {
        const subId = 'sub_skipped';
        const customerId = 'cust_skipped';

        // Seed data
        simulator.db.prepare(
            'INSERT INTO customers (id, email) VALUES (?, ?)'
        ).run(customerId, 'skipped@example.com');

        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, status, frequency_days) VALUES (?, ?, ?, ?)'
        ).run(subId, customerId, 'active', 28);

        simulator.db.prepare(
            'INSERT INTO service_history (id, subscription_id, dispatch_status, service_date) VALUES (?, ?, ?, ?)'
        )            .run('srv_skipped', subId, 'Pending', '2025-01-01T00:00:00Z');

        const payload = {
            event: 'stop.skipped',
            data: {
                id: 'routific_stop_skipped',
                customer_id: customerId,
                subscription_id: subId,
                completed_at: '2025-02-01T10:00:00Z'
            }
        };

        const bodyStr = JSON.stringify(payload);
        const signature = await computeHmac(bodyStr, WEBHOOK_SECRET);

        const request = new Request('http://localhost/api/webhooks/routific', {
            method: 'POST',
            body: bodyStr,
            headers: {
                'Content-Type': 'application/json',
                'x-routific-signature': signature,
            },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        // Verify updates
        const service = simulator.db.prepare('SELECT * FROM service_history WHERE subscription_id = ?').get(subId) as any;
        expect(service.dispatch_status).toBe('Skipped');

    });

    it('should reject malformed or invalid signature with 401 if secret is configured', async () => {
        mockEnv.ROUTIFIC_WEBHOOK_SECRET = 'my_secret';

        const request = new Request('http://localhost/api/webhooks/routific', {
            method: 'POST',
            body: JSON.stringify({ event: 'test' }),
            headers: {
                'x-routific-signature': 'invalid_sig' // invalid hex/length
            }
        });

        const response = await POST(request);
        expect(response.status).toBe(401);
    });
});
