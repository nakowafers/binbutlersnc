export interface PricingResult {
    setupFee: number;
    recurringPrice: number;
}

export type PricingFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'one-time';
export type SubscriptionFrequency = Exclude<PricingFrequency, 'one-time'>;

export interface RecurringBillingPresentation {
    planPriceLabel: string;
    summaryBillingLabel: string;
    agreementBillingLabel: string;
    defaultStartLabel: string;
}

export const ONE_TIME_PRICE = 60;

const RECURRING_BILLING_METADATA: Record<SubscriptionFrequency, {
    cadenceWeeks: number;
    priceSuffix: string;
    includesCadenceInBillingLabel: boolean;
}> = {
    monthly: {
        cadenceWeeks: 4,
        priceSuffix: '',
        includesCadenceInBillingLabel: false,
    },
    bimonthly: {
        cadenceWeeks: 8,
        priceSuffix: '',
        includesCadenceInBillingLabel: false,
    },
    quarterly: {
        cadenceWeeks: 12,
        priceSuffix: '',
        includesCadenceInBillingLabel: true,
    },
};

export function getRecurringBillingPresentation(
    recurringPrice: number,
    frequency: SubscriptionFrequency
): RecurringBillingPresentation {
    const metadata = RECURRING_BILLING_METADATA[frequency];
    const planPriceLabel = `$${recurringPrice}${metadata.priceSuffix}`;
    const cadenceLabel = `every ${metadata.cadenceWeeks} weeks`;

    if (metadata.includesCadenceInBillingLabel) {
        return {
            planPriceLabel,
            summaryBillingLabel: `${planPriceLabel} recurring ${cadenceLabel}`,
            agreementBillingLabel: `${planPriceLabel} (${cadenceLabel})`,
            defaultStartLabel: '',
        };
    }

    return {
        planPriceLabel,
        summaryBillingLabel: `${planPriceLabel} flat-rate service`,
        agreementBillingLabel: planPriceLabel,
        defaultStartLabel: `starting in ${metadata.cadenceWeeks} weeks`,
    };
}

export function calculatePricing(binQuantity: number, frequency: PricingFrequency): PricingResult {
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
