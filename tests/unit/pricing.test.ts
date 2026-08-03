import { describe, it, expect } from 'vitest';
import {
    calculatePricing,
    getRecurringBillingPresentation,
    getSubscriptionDefinition,
    getSubscriptionDefinitionByCadenceDays,
    ONE_TIME_PRICE,
    PRICING_VERSION,
} from '../../src/lib/pricing';

describe('Pricing Engine', () => {
    it('exposes the version for the complete public rate card', () => {
        expect(PRICING_VERSION).toBe('2026-08-monthly35-bimonthly50');
    });

    it.each([
        ['monthly', 'Monthly', 30, 4, 28],
        ['bimonthly', 'Bi-Monthly', 40, 8, 56],
        ['quarterly', 'Quarterly', 60, 12, 84],
    ] as const)('defines the current %s Subscription rate card', (frequency, customerFacingName, basePrice, cadenceWeeks, cadenceDays) => {
        expect(getSubscriptionDefinition(frequency)).toMatchObject({
            frequency,
            customerFacingName,
            basePrice,
            cadenceWeeks,
            cadenceDays,
        });
        expect(getSubscriptionDefinitionByCadenceDays(cadenceDays)?.customerFacingName).toBe(customerFacingName);
    });

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

    it.each([1, 2])('should charge the bimonthly base rate for %i included bins', (binQuantity) => {
        const result = calculatePricing(binQuantity, 'bimonthly');
        expect(result.setupFee).toBe(45);
        expect(result.recurringPrice).toBe(40);
    });

    it.each([
        [1, 60],
        [2, 60],
        [3, 65],
        [4, 70],
    ])('should charge quarterly rate for %i bins', (binQuantity, recurringPrice) => {
        const result = calculatePricing(binQuantity, 'quarterly');
        expect(result.setupFee).toBe(45);
        expect(result.recurringPrice).toBe(recurringPrice);
    });

    it('describes quarterly recurring billing for customer-facing copy', () => {
        expect(getRecurringBillingPresentation(65, 'quarterly')).toEqual({
            planPriceLabel: '$65',
            summaryBillingLabel: '$65 recurring every 12 weeks',
            agreementBillingLabel: '$65 (every 12 weeks)',
            defaultStartLabel: '',
        });
    });

    it.each([
        ['monthly', 30, {
            planPriceLabel: '$30',
            summaryBillingLabel: '$30 flat-rate service',
            agreementBillingLabel: '$30',
            defaultStartLabel: 'starting in 4 weeks',
        }],
        ['bimonthly', 40, {
            planPriceLabel: '$40',
            summaryBillingLabel: '$40 flat-rate service',
            agreementBillingLabel: '$40',
            defaultStartLabel: 'starting in 8 weeks',
        }],
    ] as const)('preserves %s recurring billing presentation', (frequency, recurringPrice, expected) => {
        expect(getRecurringBillingPresentation(recurringPrice, frequency)).toEqual(expected);
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
