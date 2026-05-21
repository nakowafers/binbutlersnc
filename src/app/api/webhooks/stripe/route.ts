import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { Env, Lead } from '@/lib/types';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const { env } = (getRequestContext() as unknown) as { env: Env };
        const body = await request.text();
        const signature = request.headers.get('stripe-signature') || '';

        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
            // @ts-expect-error - Newer API version
            apiVersion: '2025-01-27.acacia',
        });

        const resend = new Resend(env.RESEND_API_KEY);

        let event: Stripe.Event;

        try {
            event = await stripe.webhooks.constructEventAsync(
                body,
                signature,
                env.STRIPE_WEBHOOK_SECRET
            );
        } catch (err) {
            const error = err as Error;
            console.error(`Webhook signature verification failed: ${error.message}`);
            return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
        }

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
                return NextResponse.json({ error: 'Missing lead_id in metadata' }, { status: 400 });
            }

            // 1. Fetch Lead
            const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?')
                .bind(leadId)
                .first<Lead>();

            if (!lead) {
                return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
            }

            const existingCustomer = await env.DB.prepare('SELECT id, address_id FROM customers WHERE email = ?')
                .bind(lead.email)
                .first<{ id: string; address_id: string | null }>();

            const customerId = existingCustomer?.id || crypto.randomUUID();
            
            // Try to find if this specific address already exists for this customer
            const existingAddress = await env.DB.prepare('SELECT id FROM addresses WHERE raw_address = ? AND customer_id = ?')
                .bind(lead.address, customerId)
                .first<{ id: string }>();

            const addressId = existingAddress?.id || crypto.randomUUID();
            const subscriptionId = crypto.randomUUID();
            const serviceHistoryId = crypto.randomUUID();

            let currentPeriodEnd: string | null = null;
            if (session.subscription) {
                try {
                    const sub = await stripe.subscriptions.retrieve(session.subscription as string) as unknown as { current_period_end: number };
                    currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();
                } catch (e) {
                    console.error('Failed to fetch subscription for period end', e);
                }
            }

            // 2. Perform Atomic Update in D1
            const batchStatements = [
                // Mark lead as converted
                env.DB.prepare('UPDATE leads SET converted = TRUE WHERE id = ?').bind(leadId),

                // Create or update customer (UPSERT) without address_id first to avoid foreign key circular constraints
                env.DB.prepare(
                    `INSERT INTO customers (id, email, stripe_customer_id, phone_number, bin_quantity, sales_rep_id, tos_accepted_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(email) DO UPDATE SET 
                        stripe_customer_id = excluded.stripe_customer_id,
                        phone_number = excluded.phone_number,
                        bin_quantity = excluded.bin_quantity,
                        sales_rep_id = excluded.sales_rep_id,
                        tos_accepted_at = excluded.tos_accepted_at`
                ).bind(customerId, lead.email, session.customer as string, phoneNumber, binQuantity, salesRepId || null, tosAcceptedAt),

                // UPSERT address 
                env.DB.prepare(
                    `INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day, provider_name) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(raw_address, customer_id) DO UPDATE SET
                        latitude = excluded.latitude,
                        longitude = excluded.longitude,
                        trash_day = excluded.trash_day,
                        service_day = excluded.service_day,
                        provider_name = excluded.provider_name`
                ).bind(addressId, customerId, lead.address, lat, lng, trashDay, trashDay, providerName),

                // Update customer to link the address_id
                env.DB.prepare(
                    'UPDATE customers SET address_id = ? WHERE id = ?'
                ).bind(addressId, customerId),

                // Create subscription or one-time record
                env.DB.prepare(
                    'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days, current_period_end, last_service_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).bind(
                    subscriptionId,
                    customerId,
                    session.subscription as string || null,
                    frequency === 'one-time' ? 'one-time' : 'active',
                    frequency === 'one-time' ? 0 : (frequency === 'quarterly' ? 84 : 28),
                    currentPeriodEnd,
                    salesRepId ? new Date().toISOString() : null
                )
            ];

            // 3. D2D Fulfillment: Initial 'Completed' record ONLY for D2D reps
            if (salesRepId) {
                batchStatements.push(
                    env.DB.prepare(
                        'INSERT INTO service_history (id, customer_id, subscription_id, service_date, dispatch_status, sales_rep_id) VALUES (?, ?, ?, ?, ?, ?)'
                    ).bind(
                        serviceHistoryId,
                        customerId,
                        subscriptionId,
                        new Date().toISOString(),
                        'Completed',
                        salesRepId
                    )
                );
            }

            await env.DB.batch(batchStatements);

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

            await env.DB.prepare('UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?')
                .bind('cancelled', now, stripeSubscriptionId)
                .run();

            console.log(`Successfully cancelled subscription immediately: ${stripeSubscriptionId}`);
        } else if (event.type === 'customer.subscription.updated') {
            const subscription = event.data.object as unknown as { id: string; current_period_end: number; cancel_at_period_end: boolean; status: string };
            const stripeSubscriptionId = subscription.id;
            const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

            if (subscription.cancel_at_period_end) {
                await env.DB.prepare('UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?')
                    .bind('cancelled', currentPeriodEnd, stripeSubscriptionId)
                    .run();
                console.log(`Successfully marked subscription as cancelled at period end: ${stripeSubscriptionId}`);
            } else {
                await env.DB.prepare('UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?')
                    .bind(subscription.status, currentPeriodEnd, stripeSubscriptionId)
                    .run();
                console.log(`Successfully updated subscription: ${stripeSubscriptionId}`);
            }
        } else if (event.type === 'invoice.payment_succeeded') {
            const invoice = event.data.object as unknown as { subscription: string | null };
            const stripeSubscriptionId = invoice.subscription as string;

            if (stripeSubscriptionId) {
                const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId) as unknown as { current_period_end: number };
                const currentPeriodEnd = new Date(sub.current_period_end * 1000).toISOString();

                await env.DB.prepare('UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?')
                    .bind('active', currentPeriodEnd, stripeSubscriptionId)
                    .run();

                console.log(`Successfully updated subscription to active on payment success: ${stripeSubscriptionId}`);
            }
        } else if (event.type === 'invoice.payment_failed') {
            const invoice = event.data.object as unknown as { subscription: string | null };
            const stripeSubscriptionId = invoice.subscription as string;

            if (stripeSubscriptionId) {
                await env.DB.prepare('UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?')
                    .bind('past_due', stripeSubscriptionId)
                    .run();

                console.log(`Successfully set subscription to past_due: ${stripeSubscriptionId}`);
            }
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
