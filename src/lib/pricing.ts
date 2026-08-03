export interface PricingResult {
    setupFee: number;
    recurringPrice: number;
}

export type PricingFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'one-time';
export type SubscriptionFrequency = Exclude<PricingFrequency, 'one-time'>;

export interface SubscriptionDefinition {
    readonly frequency: SubscriptionFrequency;
    readonly customerFacingName: string;
    readonly basePrice: number;
    readonly cadenceWeeks: number;
    readonly cadenceDays: number;
    readonly priceSuffix: string;
    readonly includesCadenceInBillingLabel: boolean;
}

export interface RecurringBillingPresentation {
    planPriceLabel: string;
    summaryBillingLabel: string;
    agreementBillingLabel: string;
    defaultStartLabel: string;
}

export const ONE_TIME_PRICE = 60;

function defineSubscription(
    definition: Omit<SubscriptionDefinition, 'cadenceDays'>
): SubscriptionDefinition {
    return {
        ...definition,
        cadenceDays: definition.cadenceWeeks * 7,
    };
}

const SUBSCRIPTION_RATE_CARD: Readonly<Record<SubscriptionFrequency, SubscriptionDefinition>> = {
    monthly: defineSubscription({
        frequency: 'monthly',
        customerFacingName: 'Monthly',
        basePrice: 30,
        cadenceWeeks: 4,
        priceSuffix: '',
        includesCadenceInBillingLabel: false,
    }),
    bimonthly: defineSubscription({
        frequency: 'bimonthly',
        customerFacingName: 'Bi-Monthly',
        basePrice: 40,
        cadenceWeeks: 8,
        priceSuffix: '',
        includesCadenceInBillingLabel: false,
    }),
    quarterly: defineSubscription({
        frequency: 'quarterly',
        customerFacingName: 'Quarterly',
        basePrice: 60,
        cadenceWeeks: 12,
        priceSuffix: '',
        includesCadenceInBillingLabel: true,
    }),
};

export function getSubscriptionDefinition(frequency: SubscriptionFrequency): Readonly<SubscriptionDefinition> {
    return SUBSCRIPTION_RATE_CARD[frequency];
}

export function getSubscriptionDefinitionByCadenceDays(cadenceDays: number): Readonly<SubscriptionDefinition> | undefined {
    return Object.values(SUBSCRIPTION_RATE_CARD).find((definition) => definition.cadenceDays === cadenceDays);
}

export function getServiceCadenceDays(frequency: PricingFrequency): number {
    return frequency === 'one-time' ? 0 : getSubscriptionDefinition(frequency).cadenceDays;
}

export function getRecurringBillingPresentation(
    recurringPrice: number,
    frequency: SubscriptionFrequency
): RecurringBillingPresentation {
    const metadata = getSubscriptionDefinition(frequency);
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
    const INCLUDED_BINS = 2;
    const EXTRA_BIN_RATE = 5;

    if (frequency === 'one-time') {
        return {
            setupFee: ONE_TIME_PRICE,
            recurringPrice: 0,
        };
    }

    const baseRate = getSubscriptionDefinition(frequency).basePrice;
    const extraBins = Math.max(0, binQuantity - INCLUDED_BINS);
    const recurringPrice = baseRate + extraBins * EXTRA_BIN_RATE;

    return {
        setupFee: DEFAULT_SETUP_FEE,
        recurringPrice,
    };
}
