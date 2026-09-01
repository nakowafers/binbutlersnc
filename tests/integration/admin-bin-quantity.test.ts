import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as preview } from '../../src/app/api/admin/customers/bin-quantity/preview/route';
import { POST as confirm } from '../../src/app/api/admin/customers/bin-quantity/confirm/route';
import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { createAdminCustomerService } from '@/lib/admin/createAdminServices';

vi.mock('@cloudflare/next-on-pages', () => ({ getRequestContext: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/admin/createAdminServices', () => ({ createAdminCustomerService: vi.fn() }));

const beforeState = {
    d1Bins: 3,
    stripeCadenceDays: 28,
    stripeBasePriceId: 'price_base',
    stripeExtraBinQuantity: 1,
    stripeExtraBinPriceId: 'price_observed',
    stripeExtraBinSubscriptionItemId: 'si_observed',
    stripeCustomerBinQuantity: 3,
};

describe('admin bin quantity API', () => {
    const service = { preview: vi.fn(), confirm: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        (auth as any).mockResolvedValue({ user: { id: 'operator_1', role: 'ADMIN' } });
        (getRequestContext as any).mockReturnValue({ env: { DB: {} } });
        (createAdminCustomerService as any).mockReturnValue(service);
        service.preview.mockResolvedValue({ customerId: 'cust_1', targetBins: 4, before: beforeState, mismatch: true, requiresNoProration: true });
        service.confirm.mockResolvedValue({ customerId: 'cust_1', targetBins: 4, status: 'applied' });
    });

    it('rejects a cross-origin preview before authentication or service access', async () => {
        const response = await preview(new Request('http://localhost/api/admin/customers/bin-quantity/preview', {
            method: 'POST',
            headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId: 'cust_1', targetBins: 4, reason: 'Customer request', correlationKey: 'bins-1' }),
        }));

        expect(response.status).toBe(403);
        expect(auth).not.toHaveBeenCalled();
        expect(service.preview).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to preview without accepting browser-selected Stripe identifiers', async () => {
        const response = await preview(new Request('http://localhost/api/admin/customers/bin-quantity/preview', {
            method: 'POST',
            headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId: 'cust_1', targetBins: 4, reason: 'Customer request', correlationKey: 'bins-1', stripePriceId: 'price_attacker' }),
        }));

        expect(response.status).toBe(200);
        expect(service.preview).toHaveBeenCalledWith({ customerId: 'cust_1', targetBins: 4, reason: 'Customer request', correlationKey: 'bins-1' });
        const data = await response.json();
        expect(data).toMatchObject({ before: beforeState });
        expect(JSON.stringify(data)).not.toContain('price_attacker');
    });

    it('rejects non-admin confirmation and does not invoke the service', async () => {
        (auth as any).mockResolvedValue({ user: { id: 'customer_1', role: 'CUSTOMER' } });
        const response = await confirm(new Request('http://localhost/api/admin/customers/bin-quantity/confirm', {
            method: 'POST',
            headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId: 'cust_1', targetBins: 4, reason: 'Customer request', correlationKey: 'bins-1', previewBefore: beforeState }),
        }));

        expect(response.status).toBe(401);
        expect(service.confirm).not.toHaveBeenCalled();
    });

    it('forwards the exact preview before-state and returns service errors safely', async () => {
        const error = Object.assign(new Error('Preview is stale; refresh before confirming'), { status: 409, code: 'STALE_PREVIEW' });
        service.confirm.mockRejectedValue(error);
        const response = await confirm(new Request('http://localhost/api/admin/customers/bin-quantity/confirm', {
            method: 'POST',
            headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId: 'cust_1', targetBins: 4, reason: 'Customer request', correlationKey: 'bins-1', previewBefore: beforeState }),
        }));

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: 'Preview is stale; refresh before confirming', code: 'STALE_PREVIEW' });
        expect(service.confirm).toHaveBeenCalledWith({ customerId: 'cust_1', targetBins: 4, reason: 'Customer request', correlationKey: 'bins-1', previewBefore: beforeState });
    });
});
