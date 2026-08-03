import Stripe from 'stripe';
import { ILeadRepository, ICustomerRepository, ISubscriptionRepository, IServiceHistoryRepository } from '../db/types';
import { IPaymentService } from './types';
import { normalizeSalesRepId } from '../sales-rep';
import { normalizeEmail, normalizeAddress } from '../utils';
import { WebhookHttpError } from '../webhooks/WebhookHttpError';

export class SubscriptionLifecycle {
    constructor(
        private leadRepo: ILeadRepository,
        private customerRepo: ICustomerRepository,
        private subscriptionRepo: ISubscriptionRepository,
        private serviceHistoryRepo: IServiceHistoryRepository,
        private paymentService: IPaymentService
    ) {}

    async processEvent(event: Stripe.Event): Promise<void> {
        const claimed = await this.leadRepo.claimWebhookEvent(event.id, event.type);
        if (!claimed) {
            console.log(`Skipping already-processed event: ${event.id}`);
            return;
        }

        try {
            await this.handleEvent(event);
        } catch (error) {
            console.error(`Error processing Stripe event ${event.id}:`, error);
            await this.leadRepo.releaseWebhookEventClaim(event.id);
            throw error;
        }
    }

    private async handleEvent(event: Stripe.Event): Promise<void> {
        if (event.type === 'checkout.session.completed') {
            await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
            return;
        }

        if (event.type === 'customer.subscription.deleted') {
            await this.handleSubscriptionDeleted(event.data.object as unknown as {
                id: string;
                current_period_end?: number;
                items?: { data: Array<{ current_period_end?: number | null }> };
            });
            return;
        }

        if (event.type === 'customer.subscription.updated') {
            await this.handleSubscriptionUpdated(event.data.object as unknown as {
                id: string;
                current_period_end?: number;
                cancel_at_period_end: boolean;
                status: string;
                items?: { data: Array<{ current_period_end?: number | null }> };
            });
            return;
        }

        if (event.type === 'invoice.payment_succeeded') {
            await this.handleInvoicePaymentSucceeded(event.data.object as unknown as { subscription: string | null });
            return;
        }

        if (event.type === 'invoice.payment_failed') {
            await this.handleInvoicePaymentFailed(event.data.object as unknown as { subscription: string | null; customer: string });
            return;
        }
    }

    private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
        const metadata = session.metadata || {};
        const leadId = metadata.lead_id;
        const salesRepId = normalizeSalesRepId(metadata.sales_rep_id);
        const firstName = metadata.first_name || '';
        const lastName = metadata.last_name || '';
        const phoneNumber = metadata.phone_number;
        const trashDay = metadata.trash_day;
        const notes = metadata.notes || '';
        const scentPreference = metadata.scent_preference || 'lavender';
        const binQuantity = parseInt(metadata.bin_quantity || '1', 10);
        const lat = metadata.lat ? parseFloat(metadata.lat) : null;
        const lng = metadata.lng ? parseFloat(metadata.lng) : null;
        const frequency = (metadata.frequency || 'monthly') as 'monthly' | 'bimonthly' | 'quarterly' | 'one-time';
        const tosAcceptedAt = metadata.tos_accepted_at || null;
        const combinedName = `${firstName} ${lastName}`.trim();

        if (!leadId) {
            throw new WebhookHttpError(400, 'Missing lead_id in metadata');
        }

        const lead = await this.leadRepo.getLeadById(leadId);
        if (!lead) {
            throw new WebhookHttpError(404, 'Lead not found');
        }

        lead.email = normalizeEmail(lead.email);
        lead.address = normalizeAddress(lead.address);

        const isSubscription = !!session.subscription;

        const existingCustomer = await this.customerRepo.getCustomerByEmail(lead.email);
        const customerId = existingCustomer?.id || crypto.randomUUID();
        const existingAddress = await this.customerRepo.getAddressByRawAndCustomer(lead.address, customerId);
        const addressId = existingAddress?.id || crypto.randomUUID();
        const subscriptionId = crypto.randomUUID();
        const serviceHistoryId = crypto.randomUUID();
        const nextServiceDate = metadata.next_service_date || null;

        let currentPeriodEnd: string | null = null;
        if (isSubscription) {
            try {
                const currentPeriodEndSecs = await this.paymentService.retrieveSubscriptionPeriodEnd(session.subscription as string);
                if (!Number.isFinite(currentPeriodEndSecs)) {
                    throw new WebhookHttpError(502, `Stripe returned an invalid current_period_end for subscription ${session.subscription}`);
                }
                currentPeriodEnd = new Date(currentPeriodEndSecs * 1000).toISOString();
            } catch (error) {
                if (error instanceof WebhookHttpError) throw error;
                throw new WebhookHttpError(502, `Failed to fetch subscription period end: ${(error as Error).message}`);
            }
        }

        const firstServiceDate = salesRepId ? null : nextServiceDate;

        try {
            await this.paymentService.updateCustomerServiceDetails(session.customer as string, {
                name: combinedName,
                firstName,
                lastName,
                address: lead.address,
                trashDay,
                notes,
                scentPreference,
                phoneNumber,
                salesRepId: salesRepId || undefined,
                binQuantity: binQuantity.toString(),
                lat,
                lng,
                nextServiceDate: firstServiceDate,
            });
        } catch (error) {
            throw new WebhookHttpError(502, `Failed to update Stripe customer service details: ${(error as Error).message}`);
        }

        await this.leadRepo.convertLeadToCustomerTransaction({
            leadId,
            email: lead.email,
            firstName,
            lastName,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: isSubscription ? (session.subscription as string) : null,
            phoneNumber: phoneNumber,
            binQuantity: binQuantity,
            salesRepId: salesRepId || null,
            tosAcceptedAt,
            rawAddress: lead.address,
            latitude: lat,
            longitude: lng,
            trashDay,
            serviceDay: trashDay,
            notes,
            scentPreference,
            subscriptionId,
            addressId,
            customerId,
            currentPeriodEnd,
            serviceHistoryId,
            frequency,
            nextServiceDate: firstServiceDate,
            serviceHistoryStatus: salesRepId ? 'Completed' : undefined,
        });

        console.log(`Successfully converted lead ${leadId} to customer ${customerId}`);
    }

    private async handleSubscriptionDeleted(sub: {
        id: string;
        current_period_end?: number;
        items?: { data: Array<{ current_period_end?: number | null }> };
    }): Promise<void> {
        const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? undefined;
        if (!periodEnd) {
            throw new WebhookHttpError(500, 'Missing current period end on deleted subscription');
        }

        const stripeSubscriptionId = sub.id;
        const currentPeriodEnd = new Date(periodEnd * 1000).toISOString();

        await this.subscriptionRepo.updateSubscriptionStatus(stripeSubscriptionId, 'canceled', currentPeriodEnd);
        console.log(`Successfully cancelled subscription immediately: ${stripeSubscriptionId}`);
    }

    private async handleSubscriptionUpdated(sub: {
        id: string;
        current_period_end?: number;
        cancel_at_period_end: boolean;
        status: string;
        items?: { data: Array<{ current_period_end?: number | null }> };
    }): Promise<void> {
        const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? undefined;
        if (!periodEnd) {
            throw new WebhookHttpError(500, 'Missing current period end on updated subscription');
        }

        const stripeSubscriptionId = sub.id;
        const currentPeriodEnd = new Date(periodEnd * 1000).toISOString();

        if (sub.cancel_at_period_end) {
            await this.subscriptionRepo.updateSubscriptionStatus(stripeSubscriptionId, 'canceled', currentPeriodEnd);
            console.log(`Successfully marked subscription as cancelled at period end: ${stripeSubscriptionId}`);
        } else {
            await this.subscriptionRepo.updateSubscriptionStatus(stripeSubscriptionId, sub.status, currentPeriodEnd);
            console.log(`Successfully updated subscription: ${stripeSubscriptionId}`);
        }
    }

    private async handleInvoicePaymentSucceeded(invoice: { subscription: string | null }): Promise<void> {
        const stripeSubscriptionId = invoice.subscription;
        if (stripeSubscriptionId) {
            const currentPeriodEndSecs = await this.paymentService.retrieveSubscriptionPeriodEnd(stripeSubscriptionId);
            if (!Number.isFinite(currentPeriodEndSecs)) {
                throw new WebhookHttpError(502, `Stripe returned an invalid current_period_end for subscription ${stripeSubscriptionId}`);
            }
            const currentPeriodEnd = new Date(currentPeriodEndSecs * 1000).toISOString();

            await this.subscriptionRepo.updateSubscriptionStatus(stripeSubscriptionId, 'active', currentPeriodEnd);
            console.log(`Successfully updated subscription to active on payment success: ${stripeSubscriptionId}`);
        }
    }

    private async handleInvoicePaymentFailed(invoice: { subscription: string | null; customer: string }): Promise<void> {
        const stripeSubscriptionId = invoice.subscription;
        if (stripeSubscriptionId) {
            await this.subscriptionRepo.updateSubscriptionStatus(stripeSubscriptionId, 'past_due', null);

            console.log(`Successfully set subscription to past_due: ${stripeSubscriptionId}`);
        }
    }
}
