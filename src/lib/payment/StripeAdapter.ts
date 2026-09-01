import Stripe from 'stripe';

const cryptoProvider = Stripe.createSubtleCryptoProvider();
import { IPaymentService, CheckoutSessionParams, CustomerServiceDetails, StripeBinQuantityAdjustmentPaymentService, StripeBinQuantityAdjustmentState, SupportedRecurringCadenceDays } from './types';
import { getEndOfDayTimestamp, getRecurringBillingStartTimestamp } from '@/lib/date-utils';
import { getServiceCadenceDays } from '@/lib/pricing';
import type { BillingDriftStripeEvidence } from '@/lib/reports/billingDriftAudit';
import { stripeRecurringCadenceDays } from './stripeRecurringCadence';

function parseMetadataInteger(value: string | undefined): number | null {
    if (!value || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

export interface StripeConfig {
    secretKey: string;
    monthlyPriceId?: string;
    bimonthlyPriceId?: string;
    quarterlyPriceId?: string;
    oneTimePriceId?: string;
    setupFeePriceId?: string;
    extraBinMonthlyPriceId?: string;
    extraBinBimonthlyPriceId?: string;
    extraBinQuarterlyPriceId?: string;
}

export class StripeAdapter implements IPaymentService, StripeBinQuantityAdjustmentPaymentService {
    private stripe: Stripe;
    private config: StripeConfig;

    constructor(config: StripeConfig) {
        this.config = config;
        this.stripe = new Stripe(config.secretKey);
    }

    private requirePriceId(priceId: string | undefined, label: string): string {
        if (!priceId) {
            throw new Error(`Missing Stripe price ID for ${label}`);
        }

        return priceId;
    }

    async getBillingDriftEvidence(subscriptionId: string): Promise<BillingDriftStripeEvidence | null> {
        try {
            const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
            const periodEvidence = subscription as unknown as {
                current_period_end?: number;
                items: { data: Array<{ current_period_end?: number | null }> };
            };
            const cadenceByBasePriceId = new Map<string, number>([
                [this.config.monthlyPriceId, 28],
                [this.config.bimonthlyPriceId, 56],
                [this.config.quarterlyPriceId, 84],
            ].filter((entry): entry is [string, number] => Boolean(entry[0])));
            const recurringPrices = subscription.items.data
                .map((item) => item.price.id)
                .filter((priceId) => cadenceByBasePriceId.has(priceId))
                .map((priceId) => ({ id: priceId, intervalDays: cadenceByBasePriceId.get(priceId)! }));
            return {
                status: subscription.status,
                billingCycleAnchor: new Date(subscription.billing_cycle_anchor * 1000).toISOString(),
                currentPeriodEnd: new Date((periodEvidence.current_period_end ?? periodEvidence.items.data[0]?.current_period_end ?? 0) * 1000).toISOString(),
                recurringPrice: recurringPrices.length === 1 ? recurringPrices[0] : recurringPrices,
            };
        } catch (error) {
            if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === 'resource_missing') return null;
            throw error;
        }
    }

    async createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string | null }> {
        let priceId: string | undefined;
        let mode: Stripe.Checkout.SessionCreateParams['mode'] = 'subscription';
        const lineItems: Stripe.Checkout.SessionCreateParams['line_items'] = [];

        if (params.frequency === 'monthly') {
            priceId = this.requirePriceId(this.config.monthlyPriceId, 'monthly subscriptions');
            mode = 'subscription';
        } else if (params.frequency === 'bimonthly') {
            priceId = this.requirePriceId(this.config.bimonthlyPriceId, 'bimonthly subscriptions');
            mode = 'subscription';
        } else if (params.frequency === 'quarterly') {
            priceId = this.requirePriceId(this.config.quarterlyPriceId, 'quarterly subscriptions');
            mode = 'subscription';
        } else {
            priceId = this.requirePriceId(this.config.oneTimePriceId, 'one-time payments');
            mode = 'payment';
        }

        // Add main service item
        if (mode === 'payment' && params.setup_fee_override !== undefined) {
            let productId: string;
            if (priceId.startsWith('price_')) {
                const price = await this.stripe.prices.retrieve(priceId);
                productId = price.product as string;
            } else {
                productId = priceId;
            }

            lineItems.push({
                price_data: {
                    currency: 'usd',
                    product: productId,
                    unit_amount: Math.round(params.setup_fee_override * 100),
                },
                quantity: 1,
            });
        } else {
            lineItems.push({
                price: priceId,
                quantity: 1,
            });
        }

        // Add setup fee if it's a subscription
        if (mode === 'subscription') {
            const setupFeePriceId = this.requirePriceId(this.config.setupFeePriceId, 'subscription setup fees');

            if (params.setup_fee_override !== undefined) {
                const price = await this.stripe.prices.retrieve(setupFeePriceId);
                lineItems.push({
                    price_data: {
                        currency: 'usd',
                        product: price.product as string,
                        unit_amount: Math.round(params.setup_fee_override * 100),
                    },
                    quantity: 1,
                });
            } else {
                lineItems.push({
                    price: setupFeePriceId,
                    quantity: 1,
                });
            }
        }

        // Add extra bin surcharge for subscriptions with more than 2 bins
        if (mode === 'subscription' && params.binQuantity > 2) {
            const extraBinPriceId = params.frequency === 'monthly'
                ? this.config.extraBinMonthlyPriceId
                : params.frequency === 'bimonthly'
                    ? this.config.extraBinBimonthlyPriceId
                    : this.config.extraBinQuarterlyPriceId;

            if (!extraBinPriceId) {
                throw new Error(`Missing Stripe extra bin price ID for ${params.frequency} subscriptions`);
            }

            lineItems.push({
                price: extraBinPriceId,
                quantity: params.binQuantity - 2,
            });
        }

        const customerEmail = params.email;
        let existingCustomerId: string | null = null;
        try {
            const customers = await this.stripe.customers.list({ email: customerEmail, limit: 1 });
            existingCustomerId = customers.data[0]?.id || null;
        } catch (err) {
            console.error('Failed to look up customer by email in Stripe:', err);
        }

        let subscriptionData: NonNullable<Parameters<typeof this.stripe.checkout.sessions.create>[0]>['subscription_data'];
        if (mode === 'subscription') {
            subscriptionData = {};
            const frequencyDays = getServiceCadenceDays(params.frequency);
            if (params.serviceCycleAnchor) {
                subscriptionData.trial_end = getEndOfDayTimestamp(params.serviceCycleAnchor);
            } else if (params.nextServiceDate) {
                subscriptionData.trial_end = getRecurringBillingStartTimestamp(params.nextServiceDate, frequencyDays);
            } else {
                subscriptionData.trial_period_days = frequencyDays;
            }
        }

        const session = await this.stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: mode,
            customer: existingCustomerId || undefined,
            customer_creation: mode === 'payment' && !existingCustomerId ? 'always' : undefined,
            subscription_data: subscriptionData,
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
            customer_email: existingCustomerId ? undefined : params.email,
            metadata: {
                lead_id: params.leadId,
                sales_rep_id: params.salesRepId || '',
                first_name: params.firstName,
                last_name: params.lastName,
                phone_number: params.phoneNumber,
                trash_day: params.trashDay,
                notes: params.notes,
                bin_quantity: params.binQuantity.toString(),
                scent_preference: params.scentPreference,
                lat: params.lat?.toString() || '',
                lng: params.lng?.toString() || '',
                frequency: params.frequency,
                tos_accepted_at: params.tosAcceptedAt || '',
                next_service_date: params.nextServiceDate || '',
                d2d_service_completed: params.d2dServiceCompleted ? 'true' : 'false',
                d2d_service_date: params.d2dServiceDate || '',
                service_cycle_anchor: params.serviceCycleAnchor || '',
            },
        });

        return { url: session.url };
    }

    async getCustomerIdByEmail(email: string): Promise<string | null> {
        const stripeCustomers = await this.stripe.customers.list({
            email,
            limit: 1,
        });

        if (stripeCustomers.data.length > 0) {
            return stripeCustomers.data[0].id;
        }
        return null;
    }

    async updateCustomerServiceDetails(customerId: string, details: CustomerServiceDetails): Promise<void> {
        await this.stripe.customers.update(customerId, {
            ...(details.name ? { name: details.name } : {}),
            metadata: {
                first_name: details.firstName || '',
                last_name: details.lastName || '',
                service_address: details.address,
                trash_day: details.trashDay,
                notes: details.notes || '',
                scent_preference: details.scentPreference || '',
                phone_number: details.phoneNumber || '',
                sales_rep_id: details.salesRepId || '',
                bin_quantity: details.binQuantity || '',
                service_lat: details.lat?.toString() || '',
                service_lng: details.lng?.toString() || '',
                next_service_date: details.nextServiceDate || '',
            },
        });
    }

    async getBinQuantityAdjustmentState(customerId: string, subscriptionId: string): Promise<StripeBinQuantityAdjustmentState> {
        const [customer, subscription] = await Promise.all([
            this.stripe.customers.retrieve(customerId),
            this.stripe.subscriptions.retrieve(subscriptionId),
        ]);
        if (customer.deleted) throw new Error('Stripe customer is deleted');
        if (subscription.customer !== customerId) throw new Error('Stripe subscription belongs to a different customer');
        if (subscription.status !== 'active') throw new Error('Stripe subscription is not active');

        const basePrices = new Map<string, SupportedRecurringCadenceDays>([
            [this.requirePriceId(this.config.monthlyPriceId, 'monthly subscriptions'), 28],
            [this.requirePriceId(this.config.bimonthlyPriceId, 'bimonthly subscriptions'), 56],
            [this.requirePriceId(this.config.quarterlyPriceId, 'quarterly subscriptions'), 84],
        ]);
        const extraPrices = new Map<string, SupportedRecurringCadenceDays>([
            [this.requirePriceId(this.config.extraBinMonthlyPriceId, 'monthly extra bins'), 28],
            [this.requirePriceId(this.config.extraBinBimonthlyPriceId, 'bimonthly extra bins'), 56],
            [this.requirePriceId(this.config.extraBinQuarterlyPriceId, 'quarterly extra bins'), 84],
        ]);
        const recurringItems = subscription.items.data.filter((item) => Boolean(item.price.recurring));
        const baseItems = recurringItems.filter((item) => basePrices.has(item.price.id)
            && stripeRecurringCadenceDays(item.price.recurring) === basePrices.get(item.price.id));
        if (baseItems.length !== 1) throw new Error('Stripe subscription does not have exactly one configured base price');
        const baseItem = baseItems[0];
        const cadenceDays = basePrices.get(baseItem.price.id)!;
        const invalidRecurringItems = recurringItems.filter((item) => !basePrices.has(item.price.id) && !extraPrices.has(item.price.id));
        if (invalidRecurringItems.length > 0) throw new Error('Stripe subscription contains a non-allowlisted recurring price');
        const extraItems = recurringItems.filter((item) => extraPrices.get(item.price.id) === cadenceDays
            && stripeRecurringCadenceDays(item.price.recurring) === cadenceDays);
        const wrongCadenceExtraItems = recurringItems.filter((item) => extraPrices.has(item.price.id)
            && (extraPrices.get(item.price.id) !== cadenceDays || stripeRecurringCadenceDays(item.price.recurring) !== cadenceDays));
        if (wrongCadenceExtraItems.length > 0 || extraItems.length !== 1) {
            throw new Error('Stripe subscription does not have exactly one cadence-matched extra-bin price');
        }
        const extraItem = extraItems[0];
        const extraBinQuantity = extraItem.quantity;
        if (typeof extraBinQuantity !== 'number' || !Number.isInteger(extraBinQuantity) || extraBinQuantity < 0) throw new Error('Stripe extra-bin quantity is invalid');
        return {
            customerId,
            subscriptionId,
            status: subscription.status,
            cadenceDays,
            basePriceId: baseItem.price.id,
            extraBinPriceId: extraItem.price.id,
            extraBinSubscriptionItemId: extraItem.id,
            extraBinQuantity,
            customerBinQuantity: parseMetadataInteger(customer.metadata.bin_quantity),
        };
    }

    async updateBinQuantityAdjustment(input: {
        customerId: string;
        subscriptionId: string;
        extraBinSubscriptionItemId: string;
        extraBinQuantity: number;
        binQuantity: number;
        idempotencyKey: string;
    }): Promise<StripeBinQuantityAdjustmentState> {
        if (!Number.isInteger(input.extraBinQuantity) || input.extraBinQuantity < 0) throw new Error('Stripe extra-bin quantity is invalid');
        if (!Number.isInteger(input.binQuantity) || input.binQuantity < 2 || input.extraBinQuantity !== input.binQuantity - 2) {
            throw new Error('Stripe bin quantity is invalid');
        }
        const customer = await this.stripe.customers.retrieve(input.customerId);
        if (customer.deleted) throw new Error('Stripe customer is deleted');
        await this.stripe.subscriptionItems.update(input.extraBinSubscriptionItemId, {
            quantity: input.extraBinQuantity,
            proration_behavior: 'none',
        }, { idempotencyKey: `${input.idempotencyKey}:item` });
        await this.stripe.customers.update(input.customerId, {
            metadata: { ...customer.metadata, bin_quantity: String(input.binQuantity) },
        }, { idempotencyKey: `${input.idempotencyKey}:customer` });
        const state = await this.getBinQuantityAdjustmentState(input.customerId, input.subscriptionId);
        if (state.extraBinSubscriptionItemId !== input.extraBinSubscriptionItemId
            || state.extraBinQuantity !== input.extraBinQuantity
            || state.customerBinQuantity !== input.binQuantity) {
            throw new Error('Stripe bin quantity verification failed');
        }
        return state;
    }

    async createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
        const portalSession = await this.stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });
        return { url: portalSession.url };
    }

    async retrieveSubscriptionPeriodEnd(subscriptionId: string): Promise<number> {
        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

        const periodEnd = subscription.items?.data?.[0]?.current_period_end;

        if (typeof periodEnd !== 'number' || !Number.isFinite(periodEnd)) {
            throw new Error(`Stripe subscription ${subscriptionId} did not return a valid current_period_end`);
        }

        return periodEnd;
    }

    async retrieveCheckoutSession(sessionId: string): Promise<{ id: string; payment_status: string; customer_email: string | null; amount_total: number | null; customer: string | null }> {
        const session = await this.stripe.checkout.sessions.retrieve(sessionId);
        return {
            id: session.id,
            payment_status: session.payment_status,
            customer_email: session.customer_email || session.customer_details?.email || null,
            amount_total: session.amount_total,
            customer: (session.customer as string) || null,
        };
    }

    async verifyWebhookEvent(body: string, signature: string, secret: string): Promise<unknown> {
        return await this.stripe.webhooks.constructEventAsync(
            body,
            signature,
            secret,
            undefined,
            cryptoProvider
        );
    }
}
