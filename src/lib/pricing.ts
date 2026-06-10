export interface PricingResult {
    setupFee: number;
    recurringPrice: number;
}

export const ONE_TIME_PRICE = 60;

export function calculatePricing(binQuantity: number, frequency: 'monthly' | 'bimonthly' | 'quarterly' | 'one-time'): PricingResult {
    const DEFAULT_SETUP_FEE = 45;
    const MONTHLY_RATE = 30;
    const BIMONTHLY_RATE = 40;
    const QUARTERLY_RATE = 50;

    if (frequency === 'one-time') {
        return {
            setupFee: ONE_TIME_PRICE,
            recurringPrice: 0,
        };
    }

    const setupFee = DEFAULT_SETUP_FEE;
    const recurringPrice = frequency === 'monthly' ? MONTHLY_RATE : frequency === 'bimonthly' ? BIMONTHLY_RATE : QUARTERLY_RATE;

    return {
        setupFee,
        recurringPrice
    };
}
