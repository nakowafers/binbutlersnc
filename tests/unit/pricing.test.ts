import { describe, it, expect } from 'vitest';
import { calculatePricing, ONE_TIME_PRICE } from '../../src/lib/pricing';

describe('Pricing Engine', () => {
    it('should calculate correct setup fee (flat $45)', () => {
        const result = calculatePricing(1, 'monthly');
        expect(result.setupFee).toBe(45);
        expect(result.recurringPrice).toBe(30);
    });

    it('should calculate correct setup fee for multiple bins (still flat $45)', () => {
        const result = calculatePricing(3, 'quarterly');
        expect(result.setupFee).toBe(45);
        expect(result.recurringPrice).toBe(50);
    });

    it('should calculate correct one-time pricing', () => {
        const result = calculatePricing(1, 'one-time');
        expect(result.setupFee).toBe(ONE_TIME_PRICE);
        expect(result.setupFee).toBe(60);
        expect(result.recurringPrice).toBe(0);
    });
});
