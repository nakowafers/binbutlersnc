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

            const customerId = crypto.randomUUID();
            const addressId = crypto.randomUUID();
            const subscriptionId = crypto.randomUUID();
            const serviceHistoryId = crypto.randomUUID();

            // 2. Perform Atomic Update in D1
            const batchStatements = [
                // Mark lead as converted
                env.DB.prepare('UPDATE leads SET converted = TRUE WHERE id = ?').bind(leadId),

                // Create address
                env.DB.prepare(
                    'INSERT INTO addresses (id, raw_address, latitude, longitude, trash_day, service_day, provider_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
                ).bind(addressId, lead.address, lat, lng, trashDay, trashDay, providerName),

                // Create or update customer (UPSERT)
                // If the user already logged in via Magic Link, they exist in customers via the users view.
                // We must UPDATE their stripe details instead of failing the INSERT.
                env.DB.prepare(
                    `INSERT INTO customers (id, email, stripe_customer_id, phone_number, address_id, bin_quantity, sales_rep_id, tos_accepted_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(email) DO UPDATE SET 
                        stripe_customer_id = excluded.stripe_customer_id,
                        phone_number = excluded.phone_number,
                        address_id = excluded.address_id,
                        bin_quantity = excluded.bin_quantity,
                        sales_rep_id = excluded.sales_rep_id,
                        tos_accepted_at = excluded.tos_accepted_at`
                ).bind(customerId, lead.email, session.customer as string, phoneNumber, addressId, binQuantity, salesRepId || null, tosAcceptedAt),

                // Create subscription or one-time record
                env.DB.prepare(
                    'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days) VALUES (?, ?, ?, ?, ?)'
                ).bind(
                    subscriptionId,
                    customerId,
                    session.subscription as string || null,
                    frequency === 'one-time' ? 'one-time' : 'active',
                    frequency === 'one-time' ? 0 : (frequency === 'quarterly' ? 84 : 28)
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
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
