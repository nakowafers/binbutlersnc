import { getRequestContext } from '@cloudflare/next-on-pages';
import Stripe from 'stripe';
import { Env } from '@/lib/types';
import { StripeAdapter } from '@/lib/payment/StripeAdapter';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { RoutificAdapter } from '@/lib/routing/RoutificAdapter';

export const runtime = 'edge';

class WebhookHttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'WebhookHttpError';
    }
}

async function deleteWebhookEventClaim(db: D1Database, eventId: string): Promise<void> {
    await db.prepare('DELETE FROM webhook_events WHERE id = ?').bind(eventId).run();
}

async function processStripeEvent(
    event: Stripe.Event,
    paymentService: StripeAdapter,
    db: D1DatabaseAdapter,
    env: Env
): Promise<void> {
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};
        const leadId = metadata.lead_id;
        const salesRepId = metadata.sales_rep_id;
        const phoneNumber = metadata.phone_number;
        const trashDay = metadata.trash_day;
        const providerName = metadata.provider_name || '';
        const binQuantity = parseInt(metadata.bin_quantity || '1', 10);
        const lat = metadata.lat ? parseFloat(metadata.lat) : null;
        const lng = metadata.lng ? parseFloat(metadata.lng) : null;
        const frequency = (metadata.frequency || 'monthly') as 'monthly' | 'quarterly' | 'one-time';
        const tosAcceptedAt = metadata.tos_accepted_at || null;

        if (!leadId) {
            throw new WebhookHttpError(400, 'Missing lead_id in metadata');
        }

        const lead = await db.getLeadById(leadId);
        if (!lead) {
            throw new WebhookHttpError(404, 'Lead not found');
        }

        if (!session.subscription) {
            throw new WebhookHttpError(500, 'Missing subscription reference in checkout session');
        }

        const existingCustomer = await db.getCustomerByEmail(lead.email);
        const customerId = existingCustomer?.id || crypto.randomUUID();
        const existingAddress = await db.getAddressByRawAndCustomer(lead.address, customerId);
        const addressId = existingAddress?.id || crypto.randomUUID();
        const subscriptionId = crypto.randomUUID();
        const serviceHistoryId = crypto.randomUUID();

        let currentPeriodEnd: string;
        try {
            const currentPeriodEndSecs = await paymentService.retrieveSubscriptionPeriodEnd(session.subscription as string);
            if (!Number.isFinite(currentPeriodEndSecs)) {
                throw new Error(`Stripe returned an invalid current_period_end for subscription ${session.subscription}`);
            }
            currentPeriodEnd = new Date(currentPeriodEndSecs * 1000).toISOString();
        } catch (error) {
            throw new WebhookHttpError(502, `Failed to fetch subscription period end: ${(error as Error).message}`);
        }

        try {
            await paymentService.updateCustomerServiceDetails(session.customer as string, {
                address: lead.address,
                trashDay,
                providerName,
                phoneNumber,
                lat,
                lng,
            });
        } catch (error) {
            throw new WebhookHttpError(502, `Failed to update Stripe customer service details: ${(error as Error).message}`);
        }

        await db.convertLeadToCustomerTransaction({
            leadId,
            email: lead.email,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            phoneNumber: phoneNumber,
            binQuantity: binQuantity,
            salesRepId: salesRepId || null,
            tosAcceptedAt,
            rawAddress: lead.address,
            latitude: lat,
            longitude: lng,
            trashDay,
            serviceDay: trashDay,
            providerName,
            subscriptionId,
            addressId,
            customerId,
            currentPeriodEnd,
            serviceHistoryId,
            frequency
        });

        console.log(`Successfully converted lead ${leadId} to customer ${customerId}`);
        return;
    }

    if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object as unknown as {
            id: string;
            current_period_end?: number;
            items?: { data: Array<{ current_period_end?: number | null }> };
        };
        const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? undefined;
        if (!periodEnd) {
            throw new WebhookHttpError(500, 'Missing current period end on deleted subscription');
        }

        const stripeSubscriptionId = sub.id;
        const currentPeriodEnd = new Date(periodEnd * 1000).toISOString();

        await db.updateSubscriptionStatus(stripeSubscriptionId, 'cancelled', currentPeriodEnd);
        console.log(`Successfully cancelled subscription immediately: ${stripeSubscriptionId}`);
        return;
    }

    if (event.type === 'customer.subscription.updated') {
        const sub = event.data.object as unknown as {
            id: string;
            current_period_end?: number;
            cancel_at_period_end: boolean;
            status: string;
            items?: { data: Array<{ current_period_end?: number | null }> };
        };
        const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? undefined;
        if (!periodEnd) {
            throw new WebhookHttpError(500, 'Missing current period end on updated subscription');
        }

        const stripeSubscriptionId = sub.id;
        const currentPeriodEnd = new Date(periodEnd * 1000).toISOString();

        if (sub.cancel_at_period_end) {
            await db.updateSubscriptionStatus(stripeSubscriptionId, 'cancelled', currentPeriodEnd);
            console.log(`Successfully marked subscription as cancelled at period end: ${stripeSubscriptionId}`);
        } else {
            await db.updateSubscriptionStatus(stripeSubscriptionId, sub.status, currentPeriodEnd);
            console.log(`Successfully updated subscription: ${stripeSubscriptionId}`);
        }
        return;
    }

    if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as unknown as { subscription: string | null };
        const stripeSubscriptionId = invoice.subscription as string;

        if (stripeSubscriptionId) {
            const currentPeriodEndSecs = await paymentService.retrieveSubscriptionPeriodEnd(stripeSubscriptionId);
            if (!Number.isFinite(currentPeriodEndSecs)) {
                throw new WebhookHttpError(502, `Stripe returned an invalid current_period_end for subscription ${stripeSubscriptionId}`);
            }
            const currentPeriodEnd = new Date(currentPeriodEndSecs * 1000).toISOString();

            await db.updateSubscriptionStatus(stripeSubscriptionId, 'active', currentPeriodEnd);
            console.log(`Successfully updated subscription to active on payment success: ${stripeSubscriptionId}`);
        }
        return;
    }

    if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object as unknown as { subscription: string | null; customer: string };
        const stripeSubscriptionId = invoice.subscription as string;

        if (stripeSubscriptionId) {
            await db.updateSubscriptionStatus(stripeSubscriptionId, 'past_due', null);

            const localSubscriptionId = await db.getSubscriptionIdByStripeId(stripeSubscriptionId);

            if (localSubscriptionId) {
                try {
                    const routingService = new RoutificAdapter(env.ROUTIFIC_API_KEY, env.ROUTIFIC_WORKSPACE_ID);
                    const routificOrderIds = await db.getRoutificOrderIdsBySubscription(localSubscriptionId);
                    for (const orderId of routificOrderIds) {
                        try {
                            await routingService.deleteTarget(orderId);
                            console.log(`Deleted Routific order ${orderId} for subscription: ${stripeSubscriptionId}`);
                        } catch (orderError) {
                            console.error(`Failed to delete Routific order ${orderId}:`, orderError);
                        }
                    }
                } catch (routingError) {
                    console.error(`Failed to query Routific orders for ${stripeSubscriptionId}:`, routingError);
                }

                try {
                    await env.DB.prepare(
                        'DELETE FROM routific_dispatches WHERE subscription_id = ? AND service_date < ?'
                    ).bind(localSubscriptionId, new Date().toISOString().split('T')[0]).run();
                } catch (cleanupError) {
                    console.error('Routific dispatches cleanup failed:', cleanupError);
                }
            }

            console.log(`Successfully set subscription to past_due: ${stripeSubscriptionId}`);
        }
    }
}

export async function POST(request: Request) {
    let env: Env | undefined;
    let claimedEventId: string | null = null;

    try {
        const context = getRequestContext() as unknown as { env: Env };
        env = context?.env;
        if (!env) {
            throw new Error('Cloudflare environment not detected');
        }
        const body = await request.text();
        const signature = request.headers.get('stripe-signature') || '';

        const paymentService = new StripeAdapter({
            secretKey: env.STRIPE_SECRET_KEY,
            monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
            quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
            oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
            setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
        });

        let event: Stripe.Event;

        const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
        console.log(`[Webhook Debug] Secret starts with: ${webhookSecret?.substring(0, 10)}...`);
        console.log(`[Webhook Debug] Secret length: ${webhookSecret?.length}`);
        console.log(`[Webhook Debug] Signature header: ${signature?.substring(0, 30)}...`);
        console.log(`[Webhook Debug] Body length: ${body?.length}`);

        if (!webhookSecret || !webhookSecret.startsWith('whsec_')) {
            console.error(`[Webhook Debug] Invalid webhook secret format. Value starts with: "${webhookSecret?.substring(0, 10)}"`);
            return new Response(JSON.stringify({ error: 'Webhook secret misconfigured' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        try {
            event = await paymentService.verifyWebhookEvent(
                body,
                signature,
                webhookSecret
            ) as Stripe.Event;
        } catch (err) {
            const error = err as Error;
            console.error(`Webhook signature verification failed.`);
            console.error(`  Error name: ${error.name}`);
            console.error(`  Error message: ${error.message}`);
            console.error(`  Full error: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
            return new Response(JSON.stringify({ error: 'Webhook signature verification failed' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const db = new D1DatabaseAdapter(env.DB);

        const insertResult = await env.DB.prepare(
            'INSERT OR IGNORE INTO webhook_events (id, event_type) VALUES (?, ?)'
        ).bind(event.id, event.type).run();

        if (insertResult.meta.changes === 0) {
            console.log(`Skipping already-processed event: ${event.id}`);
            return new Response(JSON.stringify({ received: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        claimedEventId = event.id;
        await processStripeEvent(event, paymentService, db, env);

        try {
            await env.DB.prepare(
                'DELETE FROM webhook_events WHERE created_at < unixepoch() - 2592000'
            ).run();
        } catch (cleanupError) {
            console.error('Webhook events cleanup failed:', cleanupError);
        }

        try {
            await env.DB.prepare(
                'DELETE FROM routific_dispatches WHERE service_date < ?'
            ).bind(new Date().toISOString().split('T')[0]).run();
        } catch (cleanupError) {
            console.error('Routific dispatches cleanup failed:', cleanupError);
        }

        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        if (claimedEventId && env) {
            try {
                await deleteWebhookEventClaim(env.DB, claimedEventId);
            } catch (cleanupError) {
                console.error('Failed to release webhook event claim:', cleanupError);
            }
        }

        if (error instanceof WebhookHttpError) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: error.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.error('Webhook error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
