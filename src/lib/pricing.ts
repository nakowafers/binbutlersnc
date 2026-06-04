export interface PricingResult {
    setupFee: number;
    recurringPrice: number;
}

export function calculatePricing(binQuantity: number, frequency: 'monthly' | 'quarterly'): PricingResult {
    const DEFAULT_SETUP_FEE = 100;
    const MONTHLY_RATE = 30;
    const QUARTERLY_RATE = 50;

    const setupFee = DEFAULT_SETUP_FEE;
    const recurringPrice = frequency === 'monthly' ? MONTHLY_RATE : QUARTERLY_RATE;

    return {
        setupFee,
        recurringPrice
    };
}
