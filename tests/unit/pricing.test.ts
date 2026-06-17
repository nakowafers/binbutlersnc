import { describe, it, expect } from 'vitest';
import { calculatePricing, ONE_TIME_PRICE } from '../../src/lib/pricing';

describe('Pricing Engine', () => {
    it('should charge base rate for 1 bin', () => {
        const result = calculatePricing(1, 'monthly');
        expect(result.setupFee).toBe(45);
        expect(result.recurringPrice).toBe(30);
    });

    it('should charge base rate for 2 bins', () => {
        const result = calculatePricing(2, 'monthly');
        expect(result.setupFee).toBe(45);
        expect(result.recurringPrice).toBe(30);
    });

    it('should add surcharge for 3 bins (quarterly)', () => {
        const result = calculatePricing(3, 'quarterly');
        expect(result.setupFee).toBe(45);
        expect(result.recurringPrice).toBe(55); // 50 + 5
    });

    it('should add surcharge for each bin over 2', () => {
        const result = calculatePricing(5, 'bimonthly');
        expect(result.setupFee).toBe(45);
        expect(result.recurringPrice).toBe(55); // 40 + 15
    });

    it('should not surcharge one-time', () => {
        const result = calculatePricing(10, 'one-time');
        expect(result.setupFee).toBe(ONE_TIME_PRICE);
        expect(result.setupFee).toBe(60);
        expect(result.recurringPrice).toBe(0);
    });

    it('should handle 1 bin one-time', () => {
        const result = calculatePricing(1, 'one-time');
        expect(result.setupFee).toBe(60);
        expect(result.recurringPrice).toBe(0);
    });
});
