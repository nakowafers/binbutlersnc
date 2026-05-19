import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../src/app/api/admin/settings/route';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { auth } from '@/auth';

// Mock Cloudflare context
vi.mock('@cloudflare/next-on-pages', () => ({
    getRequestContext: vi.fn(),
}));

// Mock NextAuth
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

describe('Admin Settings API - Holiday Shift', () => {
    let mockDb: any;
    let mockEnv: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockDb = {
            prepare: vi.fn().mockReturnThis(),
            bind: vi.fn().mockReturnThis(),
            run: vi.fn().mockResolvedValue({ success: true }),
        };

        mockEnv = {
            DB: mockDb,
        };

        (getRequestContext as any).mockReturnValue({ env: mockEnv });
    });

    it('should reject non-admin users with 401 Unauthorized', async () => {
        // Mock non-admin user
        (auth as any).mockResolvedValue({
            user: { role: 'CUSTOMER' }
        });

        const request = new Request('http://localhost/api/admin/settings', {
            method: 'POST',
            body: JSON.stringify({ key: 'holiday_offset_hours', value: '24' }),
            headers: { 'Content-Type': 'application/json' }
        });

        const response = await POST(request);
        
        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data).toEqual({ error: 'Unauthorized' });
        expect(mockDb.prepare).not.toHaveBeenCalled();
    });

    it('should reject request missing key or value with 400 Bad Request', async () => {
        // Mock admin user
        (auth as any).mockResolvedValue({
            user: { role: 'ADMIN' }
        });

        const request = new Request('http://localhost/api/admin/settings', {
            method: 'POST',
            body: JSON.stringify({ key: 'holiday_offset_hours' }), // Missing value
            headers: { 'Content-Type': 'application/json' }
        });

        const response = await POST(request);
        
        expect(response.status).toBe(400);
        const data = await response.json();
        expect(data).toEqual({ error: 'Missing key or value' });
    });

    it('should allow ADMIN to save global settings (Holiday Shift)', async () => {
        // Mock admin user
        (auth as any).mockResolvedValue({
            user: { role: 'ADMIN' }
        });

        const request = new Request('http://localhost/api/admin/settings', {
            method: 'POST',
            body: JSON.stringify({ key: 'holiday_offset_hours', value: '24' }),
            headers: { 'Content-Type': 'application/json' }
        });

        const response = await POST(request);
        
        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ success: true });

        // Verify DB calls
        expect(mockDb.prepare).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO global_settings')
        );
        expect(mockDb.bind).toHaveBeenCalledWith('holiday_offset_hours', '24');
        expect(mockDb.run).toHaveBeenCalled();
    });
});
