import { describe, it, expect } from 'vitest';
import { calculatePricing } from '../../src/lib/pricing';

describe('Pricing Engine', () => {
    it('should calculate correct setup fee (flat $100)', () => {
        const result = calculatePricing(1, 'monthly');
        expect(result.setupFee).toBe(100);
        expect(result.recurringPrice).toBe(30);
    });

    it('should calculate correct setup fee for multiple bins (still flat $100)', () => {
        const result = calculatePricing(3, 'quarterly');
        expect(result.setupFee).toBe(100);
        expect(result.recurringPrice).toBe(40);
    });
});
