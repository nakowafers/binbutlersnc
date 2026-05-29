import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../src/app/api/portal/reschedule/route';
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

describe('Portal Reschedule API Route', () => {
    let testDb: any;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();

        const { db, d1Mock } = createTestD1();
        testDb = db;
        mockEnv = {
            DB: d1Mock,
        };

        (getRequestContext as any).mockReturnValue({ env: mockEnv });

        // Seed basic customers & addresses
        testDb.exec(`
            INSERT INTO customers (id, email, address_id)
            VALUES ('cust_123', 'user@example.com', NULL);

            INSERT INTO addresses (id, customer_id, raw_address, trash_day, service_day)
            VALUES ('addr_123', 'cust_123', '123 Butler Way', 'MON', 'MON');

            UPDATE customers SET address_id = 'addr_123' WHERE id = 'cust_123';

            INSERT INTO customers (id, email, address_id)
            VALUES ('cust_no_addr', 'noaddr@example.com', NULL);
        `);
    });

    it('should return 401 Unauthorized if no session is active', async () => {
        (auth as any).mockResolvedValue(null);

        const request = new Request('http://localhost/api/portal/reschedule', {
            method: 'POST',
            body: JSON.stringify({ serviceDay: 'TUE' }),
            headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
        });

        const response = await POST(request);
        expect(response.status).toBe(401);

        const data = await response.json();
        expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('should return 400 Bad Request if serviceDay is invalid', async () => {
        (auth as any).mockResolvedValue({
            user: { email: 'user@example.com' }
        });

        const request = new Request('http://localhost/api/portal/reschedule', {
            method: 'POST',
            body: JSON.stringify({ serviceDay: 'SATURDAY' }), // Invalid day
            headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
        });

        const response = await POST(request);
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error).toContain('Invalid service day');
    });

    it('should return 400 Bad Request if customer has no address_id', async () => {
        (auth as any).mockResolvedValue({
            user: { email: 'noaddr@example.com' }
        });

        const request = new Request('http://localhost/api/portal/reschedule', {
            method: 'POST',
            body: JSON.stringify({ serviceDay: 'TUE' }),
            headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
        });

        const response = await POST(request);
        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error).toContain('No address associated');
    });

    it('should successfully update address details for a valid customer', async () => {
        (auth as any).mockResolvedValue({
            user: { email: 'user@example.com' }
        });

        const payload = {
            serviceDay: 'WED',
            trashDay: 'THU',
            gateCode: '9999',
            hoaName: 'Sunny Hills',
            accessNotes: 'Beware of the dog'
        };

        const request = new Request('http://localhost/api/portal/reschedule', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.address.service_day).toBe('WED');
        expect(data.address.trash_day).toBe('THU');
        expect(data.address.gate_code).toBe('9999');

        // Query the actual DB to check if constraints and updates persisted
        const updatedAddress = testDb.prepare('SELECT * FROM addresses WHERE id = ?').get('addr_123') as any;
        expect(updatedAddress.service_day).toBe('WED');
        expect(updatedAddress.trash_day).toBe('THU');
        expect(updatedAddress.gate_code).toBe('9999');
        expect(updatedAddress.hoa_name).toBe('Sunny Hills');
        expect(updatedAddress.access_notes).toBe('Beware of the dog');
    });
});
