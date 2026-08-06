import { describe, it, expect } from 'vitest';
import {
    calculatePricing,
    getCheckoutBillingDisclosure,
    getRecurringBillingPresentation,
    getSubscriptionDefinition,
    getSubscriptionDefinitionByCadenceDays,
    ONE_TIME_PRICE,
    PRICING_VERSION,
} from '@/lib/pricing';

describe('Pricing Engine', () => {
    it('exposes the version for the complete public rate card', () => {
        expect(PRICING_VERSION).toBe('2026-08-monthly30-bimonthly40');
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
        ['monthly', 3, 35],
        ['bimonthly', 3, 45],
        ['monthly', 5, 45],
        ['bimonthly', 5, 55],
    ] as const)('charges $5 per additional bin for %s with %i bins', (frequency, binQuantity, recurringPrice) => {
        expect(calculatePricing(binQuantity, frequency)).toEqual({
            setupFee: 45,
            recurringPrice,
        });
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
            summaryBillingLabel: '$30 every 4 weeks',
            agreementBillingLabel: '$30 every 4 weeks',
            defaultStartLabel: 'after the 28-day trial',
        }],
        ['bimonthly', 40, {
            planPriceLabel: '$40',
            summaryBillingLabel: '$40 every 8 weeks',
            agreementBillingLabel: '$40 every 8 weeks',
            defaultStartLabel: 'after the 56-day trial',
        }],
    ] as const)('discloses %s recurring billing cadence', (frequency, recurringPrice, expected) => {
        expect(getRecurringBillingPresentation(recurringPrice, frequency)).toEqual(expected);
    });

    it('discloses the default Bi-Monthly trial without inventing a first-service date', () => {
        expect(getCheckoutBillingDisclosure({
            setupFee: 45,
            recurringPrice: 45,
            frequency: 'bimonthly',
        })).toEqual({
            subscriptionName: 'Bi-Monthly',
            summaryLine: '$45 initial fee paid today covers your first clean. $45 every 8 weeks recurring billing begins after the 56-day trial.',
            agreementLine: 'The one-time initial cleaning fee of $45 paid today covers your first clean. Your $45 every 8 weeks recurring billing begins after the 56-day trial and will automatically renew until cancelled via the Stripe Billing Portal.',
        });
    });

    it('discloses the first clean and next Monthly recurring charge as separate dates', () => {
        expect(getCheckoutBillingDisclosure({
            setupFee: 45,
            recurringPrice: 30,
            frequency: 'monthly',
            firstServiceDate: '2026-08-10',
        })).toEqual({
            subscriptionName: 'Monthly',
            summaryLine: '$45 initial fee paid today covers your first clean on August 10, 2026. $30 every 4 weeks recurring billing begins on September 7, 2026.',
            agreementLine: 'The one-time initial cleaning fee of $45 paid today covers your first clean on August 10, 2026. Your $30 every 4 weeks recurring billing begins on September 7, 2026 and will automatically renew until cancelled via the Stripe Billing Portal.',
        });
    });

    it('keeps the Quarterly first clean separate from its 84-day recurring start', () => {
        expect(getCheckoutBillingDisclosure({
            setupFee: 45,
            recurringPrice: 60,
            frequency: 'quarterly',
            firstServiceDate: '2026-08-10',
        })).toMatchObject({
            subscriptionName: 'Quarterly',
            summaryLine: '$45 initial fee paid today covers your first clean on August 10, 2026. $60 every 12 weeks recurring billing begins on November 2, 2026.',
        });
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
