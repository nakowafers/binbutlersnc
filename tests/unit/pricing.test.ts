import { describe, it, expect } from 'vitest';
import { calculatePricing } from '../../src/lib/pricing';

describe('Pricing Engine', () => {
    it('should calculate correct setup fee (flat $60)', () => {
        const result = calculatePricing(1, 'monthly');
        expect(result.setupFee).toBe(60);
        expect(result.recurringPrice).toBe(30);
    });

    it('should calculate correct setup fee for multiple bins (still flat $60)', () => {
        const result = calculatePricing(3, 'quarterly');
        expect(result.setupFee).toBe(60);
        expect(result.recurringPrice).toBe(50);
    });
});
