import { describe, expect, it } from 'vitest';
import { normalizeCheckoutPayload } from '@/lib/checkout/checkoutSchema';
import { PRICING_VERSION } from '@/lib/pricing';

const validPayload = {
    pricing_version: PRICING_VERSION,
    email: 'd2d@example.com',
    first_name: 'D2D',
    last_name: 'Customer',
    address: '123 Attestation Road',
    lat: 35,
    lng: -80,
    phone_number: '555-1212',
    trash_day: 'MON',
    scent_preference: 'lavender',
    bin_quantity: 1,
    frequency: 'monthly',
    tos_accepted: true,
    age_confirmed: true,
    contact_consent: true,
};

describe('checkout D2D service attestation', () => {
    it('rejects a Sales Rep ID without the explicit immediate-service attestation', () => {
        expect(normalizeCheckoutPayload({ ...validPayload, sales_rep_id: 'REP_1' }).d2d_service_completed).toBe(false);
    });

    it('rejects immediate service paired with a different future First Service Date', () => {
        expect(() => normalizeCheckoutPayload({
            ...validPayload,
            sales_rep_id: 'REP_1',
            d2d_service_completed: true,
            d2d_service_date: '2026-03-08',
            next_service_date: '2026-04-06',
        })).toThrow('Immediate D2D service cannot also have a different First Service Date');
    });

    it('requires a canonical actual Eastern Service Date when immediate service is attested', () => {
        expect(() => normalizeCheckoutPayload({
            ...validPayload,
            sales_rep_id: 'REP_1',
            d2d_service_completed: true,
            d2d_service_date: '03/08/2026',
        })).toThrow('actual canonical Eastern Service Date');
    });
});
