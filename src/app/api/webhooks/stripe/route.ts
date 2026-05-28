import { getRequestContext } from '@cloudflare/next-on-pages';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { Env, Lead } from '@/lib/types';
import { StripeAdapter } from '@/lib/payment/StripeAdapter';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const { env } = (getRequestContext() as unknown) as { env: Env };
        const body = await request.text();
        const signature = request.headers.get('stripe-signature') || '';

        const paymentService = new StripeAdapter({
            secretKey: env.STRIPE_SECRET_KEY,
            monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
            quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
            oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
            setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
        });

        const resend = new Resend(env.RESEND_API_KEY);

        let event: Stripe.Event;

        try {
            event = await paymentService.verifyWebhookEvent(
                body,
                signature,
                env.STRIPE_WEBHOOK_SECRET
            ) as Stripe.Event;
        } catch (err) {
            const error = err as Error;
            console.error(`Webhook signature verification failed: ${error.message}`);
            return new Response(JSON.stringify({ error: 'Webhook signature verification failed' }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const db = new D1DatabaseAdapter(env.DB);

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            const metadata = session.metadata || {};
            const leadId = metadata.lead_id;
            const salesRepId = metadata.sales_rep_id;
            const phoneNumber = metadata.phone_number;
            const trashDay = metadata.trash_day;
            const providerName = metadata.provider_name;
            const binQuantity = parseInt(metadata.bin_quantity || '1', 10);
            const lat = metadata.lat ? parseFloat(metadata.lat) : null;
            const lng = metadata.lng ? parseFloat(metadata.lng) : null;
            const frequency = (metadata.frequency || 'monthly') as 'monthly' | 'quarterly' | 'one-time';
            const tosAcceptedAt = metadata.tos_accepted_at || null;

            if (!leadId) {
                return new Response(JSON.stringify({ error: 'Missing lead_id in metadata' }), { 
                    status: 400, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }

            // 1. Fetch Lead
            const lead = await db.getLeadById(leadId);

            if (!lead) {
                return new Response(JSON.stringify({ error: 'Lead not found' }), { 
                    status: 404, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }

            const existingCustomer = await db.getCustomerByEmail(lead.email);

            const customerId = existingCustomer?.id || crypto.randomUUID();
            
            // Try to find if this specific address already exists for this customer
            const existingAddress = await db.getAddressByRawAndCustomer(lead.address, customerId);

            const addressId = existingAddress?.id || crypto.randomUUID();
            const subscriptionId = crypto.randomUUID();
            const serviceHistoryId = crypto.randomUUID();

            let currentPeriodEnd: string | null = null;
            if (session.subscription) {
                try {
                    const currentPeriodEndSecs = await paymentService.retrieveSubscriptionPeriodEnd(session.subscription as string);
                    currentPeriodEnd = new Date(currentPeriodEndSecs * 1000).toISOString();
                } catch (e) {
                    console.error('Failed to fetch subscription for period end', e);
                }
            }

            // 2. Perform Atomic Update in Database via Adapter
            await db.convertLeadToCustomerTransaction({
                leadId,
                email: lead.email,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: session.subscription as string || null,
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
                serviceHistoryId
            });

            // 3. Contract Delivery: Send ToS Copy via Resend
            if (frequency !== 'one-time') {
                try {
                    await resend.emails.send({
                        from: 'Bin Butlers NC <notifications@binbutlersnc.com>',
                        to: lead.email,
                        subject: 'Your Bin Butlers NC Service Agreement',
                        html: `
                            <h1>Service Agreement Confirmation</h1>
                            <p>Thank you for choosing Bin Butlers NC!</p>
                            <p>This email serves as a copy of your service agreement for the property at <strong>${lead.address}</strong>.</p>
                            <hr />
                            <h3>Agreement Details</h3>
                            <ul>
                                <li><strong>Plan:</strong> ${frequency.toUpperCase()}</li>
                                <li><strong>Bins:</strong> ${binQuantity}</li>
                                <li><strong>Trash Day:</strong> ${trashDay}</li>
                                <li><strong>Accepted On:</strong> ${tosAcceptedAt}</li>
                            </ul>
                            <h3>Summary of Terms</h3>
                            <p>You have agreed to a ${frequency} cleaning service. Your bins must be accessible on your scheduled service day. Cancellations must be made 48 hours in advance.</p>
                            <p>A full copy of our terms is available in your customer portal.</p>
                        `
                    });
                } catch (emailError) {
                    console.error('Failed to send ToS email:', emailError);
                    // We don't fail the webhook if the email fails
                }
            }

            console.log(`Successfully converted lead ${leadId} to customer ${customerId}`);
        } else if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object as unknown as { id: string };
            const stripeSubscriptionId = subscription.id;
            const now = new Date().toISOString();

            await db.updateSubscriptionStatus(stripeSubscriptionId, 'cancelled', now);

            console.log(`Successfully cancelled subscription immediately: ${stripeSubscriptionId}`);
        } else if (event.type === 'customer.subscription.updated') {
            const subscription = event.data.object as unknown as { id: string; current_period_end: number; cancel_at_period_end: boolean; status: string };
            const stripeSubscriptionId = subscription.id;
            const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

            if (subscription.cancel_at_period_end) {
                await db.updateSubscriptionStatus(stripeSubscriptionId, 'cancelled', currentPeriodEnd);
                console.log(`Successfully marked subscription as cancelled at period end: ${stripeSubscriptionId}`);
            } else {
                await db.updateSubscriptionStatus(stripeSubscriptionId, subscription.status, currentPeriodEnd);
                console.log(`Successfully updated subscription: ${stripeSubscriptionId}`);
            }
        } else if (event.type === 'invoice.payment_succeeded') {
            const invoice = event.data.object as unknown as { subscription: string | null };
            const stripeSubscriptionId = invoice.subscription as string;

            if (stripeSubscriptionId) {
                const currentPeriodEndSecs = await paymentService.retrieveSubscriptionPeriodEnd(stripeSubscriptionId);
                const currentPeriodEnd = new Date(currentPeriodEndSecs * 1000).toISOString();

                await db.updateSubscriptionStatus(stripeSubscriptionId, 'active', currentPeriodEnd);

                console.log(`Successfully updated subscription to active on payment success: ${stripeSubscriptionId}`);
            }
        } else if (event.type === 'invoice.payment_failed') {
            const invoice = event.data.object as unknown as { subscription: string | null };
            const stripeSubscriptionId = invoice.subscription as string;

            if (stripeSubscriptionId) {
                await db.updateSubscriptionStatus(stripeSubscriptionId, 'past_due', null);

                console.log(`Successfully set subscription to past_due: ${stripeSubscriptionId}`);
            }
        }

        return new Response(JSON.stringify({ received: true }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (error) {
        console.error('Webhook error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
