import Stripe from 'stripe';
import { IPaymentService, CheckoutSessionParams } from './types';

export interface StripeConfig {
    secretKey: string;
    monthlyPriceId: string;
    quarterlyPriceId: string;
    oneTimePriceId: string;
    setupFeePriceId: string;
}

export class StripeAdapter implements IPaymentService {
    private stripe: Stripe;
    private config: StripeConfig;

    constructor(config: StripeConfig) {
        this.config = config;
        this.stripe = new Stripe(config.secretKey);
    }

    async createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string | null }> {
        let priceId: string | undefined;
        let mode: Stripe.Checkout.SessionCreateParams['mode'] = 'subscription';
        const lineItems: Stripe.Checkout.SessionCreateParams['line_items'] = [];

        if (params.frequency === 'monthly') {
            priceId = this.config.monthlyPriceId;
            mode = 'subscription';
        } else if (params.frequency === 'quarterly') {
            priceId = this.config.quarterlyPriceId;
            mode = 'subscription';
        } else {
            priceId = this.config.oneTimePriceId;
            mode = 'payment';
        }

        if (!priceId) {
            throw new Error(`Price ID not configured for frequency ${params.frequency}`);
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
            const setupFeePriceId = this.config.setupFeePriceId;
            if (!setupFeePriceId) {
                throw new Error('Setup fee price ID not configured');
            }

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

        const customerEmail = params.email;
        let existingCustomerId: string | null = null;
        try {
            const customers = await this.stripe.customers.list({ email: customerEmail, limit: 1 });
            existingCustomerId = customers.data[0]?.id || null;
        } catch (err) {
            console.error('Failed to look up customer by email in Stripe:', err);
        }

        const session = await this.stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: mode,
            customer: existingCustomerId || undefined,
            customer_creation: existingCustomerId ? undefined : 'always',
            subscription_data: mode === 'subscription' ? {
                trial_period_days: params.frequency === 'monthly' ? 28 : 84,
            } : undefined,
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
            customer_email: existingCustomerId ? undefined : params.email,
            metadata: {
                lead_id: params.leadId,
                sales_rep_id: params.salesRepId || '',
                phone_number: params.phoneNumber,
                trash_day: params.trashDay,
                provider_name: params.providerName,
                bin_quantity: params.binQuantity.toString(),
                lat: params.lat?.toString() || '',
                lng: params.lng?.toString() || '',
                frequency: params.frequency,
                tos_accepted_at: params.tosAcceptedAt || '',
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

    async createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
        const portalSession = await this.stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });
        return { url: portalSession.url };
    }

    async retrieveSubscriptionPeriodEnd(subscriptionId: string): Promise<number> {
        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId) as unknown as { current_period_end: number };
        return subscription.current_period_end;
    }

    async retrieveCheckoutSession(sessionId: string): Promise<{ id: string; payment_status: string; customer_email: string | null; amount_total: number | null }> {
        const session = await this.stripe.checkout.sessions.retrieve(sessionId);
        return {
            id: session.id,
            payment_status: session.payment_status,
            customer_email: session.customer_email || session.customer_details?.email || null,
            amount_total: session.amount_total,
        };
    }

    async verifyWebhookEvent(body: string, signature: string, secret: string): Promise<unknown> {
        return await this.stripe.webhooks.constructEventAsync(body, signature, secret);
    }
}
