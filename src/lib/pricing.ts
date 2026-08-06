import { addDaysToDateString } from '@/lib/date-utils';

export interface PricingResult {
    setupFee: number;
    recurringPrice: number;
}

export const PRICING_VERSION = '2026-08-monthly30-bimonthly40';

export type PricingFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'one-time';
export type SubscriptionFrequency = Exclude<PricingFrequency, 'one-time'>;

export interface SubscriptionDefinition {
    readonly frequency: SubscriptionFrequency;
    readonly customerFacingName: string;
    readonly basePrice: number;
    readonly cadenceWeeks: number;
    readonly cadenceDays: number;
    readonly includesCadenceInBillingLabel: boolean;
}

export interface RecurringBillingPresentation {
    planPriceLabel: string;
    summaryBillingLabel: string;
    agreementBillingLabel: string;
    defaultStartLabel: string;
}

export interface CheckoutBillingDisclosure {
    subscriptionName: string;
    summaryLine: string;
    agreementLine: string;
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
        includesCadenceInBillingLabel: false,
    }),
    bimonthly: defineSubscription({
        frequency: 'bimonthly',
        customerFacingName: 'Bi-Monthly',
        basePrice: 40,
        cadenceWeeks: 8,
        includesCadenceInBillingLabel: false,
    }),
    quarterly: defineSubscription({
        frequency: 'quarterly',
        customerFacingName: 'Quarterly',
        basePrice: 60,
        cadenceWeeks: 12,
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
    const planPriceLabel = `$${recurringPrice}`;
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
        summaryBillingLabel: `${planPriceLabel} ${cadenceLabel}`,
        agreementBillingLabel: `${planPriceLabel} ${cadenceLabel}`,
        defaultStartLabel: `after the ${metadata.cadenceDays}-day trial`,
    };
}

function formatCustomerDate(dateString: string): string {
    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${dateString}T12:00:00Z`));
}

export function getCheckoutBillingDisclosure(input: {
    setupFee: number;
    recurringPrice: number;
    frequency: SubscriptionFrequency;
    firstServiceDate?: string;
}): CheckoutBillingDisclosure {
    const definition = getSubscriptionDefinition(input.frequency);
    const firstCleanDate = input.firstServiceDate
        ? formatCustomerDate(input.firstServiceDate)
        : null;
    const recurringStartDate = input.firstServiceDate
        ? formatCustomerDate(addDaysToDateString(input.firstServiceDate, definition.cadenceDays))
        : null;

    const firstCleanClause = firstCleanDate ? ` on ${firstCleanDate}` : '';
    const recurringStartClause = recurringStartDate
        ? `on ${recurringStartDate}`
        : `after the ${definition.cadenceDays}-day trial`;
    const recurringBillingLabel = `$${input.recurringPrice} every ${definition.cadenceWeeks} weeks`;

    return {
        subscriptionName: definition.customerFacingName,
        summaryLine: `$${input.setupFee} initial fee paid today covers your first clean${firstCleanClause}. ${recurringBillingLabel} recurring billing begins ${recurringStartClause}.`,
        agreementLine: `The one-time initial cleaning fee of $${input.setupFee} paid today covers your first clean${firstCleanClause}. Your ${recurringBillingLabel} recurring billing begins ${recurringStartClause} and will automatically renew until cancelled via the Stripe Billing Portal.`,
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
