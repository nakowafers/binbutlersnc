import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../src/app/api/portal/vacation/route';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { auth } from '@/auth';
import { createTestD1 } from '../db-helper';

// Mock Cloudflare context
vi.mock('@cloudflare/next-on-pages', () => ({
    getRequestContext: vi.fn(),
}));

// Mock NextAuth
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

describe('Portal Vacation API Route', () => {
    let testDb: any;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Create a fresh in-memory SQLite database for each test
        const { db, d1Mock } = createTestD1();
        testDb = db;
        mockEnv = {
            DB: d1Mock,
        };

        (getRequestContext as any).mockReturnValue({ env: mockEnv });

        // Seed basic customers & subscriptions
        testDb.exec(`
            INSERT INTO customers (id, email) VALUES ('cust_123', 'user@example.com');
            INSERT INTO customers (id, email) VALUES ('cust_456', 'other@example.com');

            INSERT INTO subscriptions (id, customer_id, status, frequency_days, is_paused) 
            VALUES ('sub_123', 'cust_123', 'active', 28, 0);

            INSERT INTO subscriptions (id, customer_id, status, frequency_days, is_paused) 
            VALUES ('sub_456', 'cust_456', 'active', 28, 0);
        `);
    });

    it('should return 401 Unauthorized if no session is active', async () => {
        (auth as any).mockResolvedValue(null);

        const request = new Request('http://localhost/api/portal/vacation', {
            method: 'POST',
            body: JSON.stringify({ subscriptionId: 'sub_123', isPaused: true }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        expect(response.status).toBe(401);
        
        const data = await response.json();
        expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('should return 400 Bad Request if parameters are missing', async () => {
        (auth as any).mockResolvedValue({
            user: { email: 'user@example.com' }
        });

        const request = new Request('http://localhost/api/portal/vacation', {
            method: 'POST',
            body: JSON.stringify({ subscriptionId: 'sub_123' }), // isPaused missing
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data).toEqual({ error: 'Missing subscriptionId or isPaused' });
    });

    it('should return 404 if subscription belongs to a different customer', async () => {
        // Authenticated as other@example.com (cust_456), trying to pause sub_123 (cust_123)
        (auth as any).mockResolvedValue({
            user: { email: 'other@example.com' }
        });

        const request = new Request('http://localhost/api/portal/vacation', {
            method: 'POST',
            body: JSON.stringify({ subscriptionId: 'sub_123', isPaused: true }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.error).toContain('Subscription not found or unauthorized');
    });

    it('should successfully toggle is_paused for a valid subscription', async () => {
        (auth as any).mockResolvedValue({
            user: { email: 'user@example.com' }
        });

        // 1. Pause subscription
        const request1 = new Request('http://localhost/api/portal/vacation', {
            method: 'POST',
            body: JSON.stringify({ subscriptionId: 'sub_123', isPaused: true }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response1 = await POST(request1);
        expect(response1.status).toBe(200);
        
        const data1 = await response1.json();
        expect(data1).toEqual({ success: true, isPaused: true });

        // Query the actual DB to check constraint/value
        const row1 = testDb.prepare('SELECT is_paused FROM subscriptions WHERE id = ?').get('sub_123') as any;
        expect(row1.is_paused).toBe(1); // SQLite returns 1 for true

        // 2. Unpause subscription
        const request2 = new Request('http://localhost/api/portal/vacation', {
            method: 'POST',
            body: JSON.stringify({ subscriptionId: 'sub_123', isPaused: false }),
            headers: { 'Content-Type': 'application/json' },
        });

        const response2 = await POST(request2);
        expect(response2.status).toBe(200);

        const data2 = await response2.json();
        expect(data2).toEqual({ success: true, isPaused: false });

        const row2 = testDb.prepare('SELECT is_paused FROM subscriptions WHERE id = ?').get('sub_123') as any;
        expect(row2.is_paused).toBe(0); // SQLite returns 0 for false
    });
});
