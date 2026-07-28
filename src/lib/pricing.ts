export interface PricingResult {
    setupFee: number;
    recurringPrice: number;
}

export const ONE_TIME_PRICE = 60;

export function calculatePricing(binQuantity: number, frequency: 'monthly' | 'bimonthly' | 'quarterly' | 'one-time'): PricingResult {
    const DEFAULT_SETUP_FEE = 45;
    const MONTHLY_RATE = 30;
    const BIMONTHLY_RATE = 40;
    const QUARTERLY_RATE = 60;
    const INCLUDED_BINS = 2;
    const EXTRA_BIN_RATE = 5;

    if (frequency === 'one-time') {
        return {
            setupFee: ONE_TIME_PRICE,
            recurringPrice: 0,
        };
    }

    const baseRate = frequency === 'monthly' ? MONTHLY_RATE : frequency === 'bimonthly' ? BIMONTHLY_RATE : QUARTERLY_RATE;
    const extraBins = Math.max(0, binQuantity - INCLUDED_BINS);
    const recurringPrice = baseRate + extraBins * EXTRA_BIN_RATE;

    return {
        setupFee: DEFAULT_SETUP_FEE,
        recurringPrice,
    };
}
