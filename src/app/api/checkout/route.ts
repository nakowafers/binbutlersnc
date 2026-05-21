import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { Env } from '@/lib/types';

export const runtime = 'edge';

const checkoutSchema = z.object({
    email: z.string().email(),
    address: z.string().min(5),
    lat: z.number().optional(),
    lng: z.number().optional(),
    phone_number: z.string(),
    trash_day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI']),
    provider_name: z.string(),
    bin_quantity: z.number().min(1),
    frequency: z.enum(['monthly', 'quarterly', 'one-time']),
    sales_rep_id: z.string().optional(),
    setup_fee_override: z.number().optional(),
    tos_accepted: z.boolean().optional(),
});

export async function POST(request: Request) {
    try {
        const context = getRequestContext() as unknown as { env: Env };
        const env = context?.env;

        if (!env) {
            console.error('Missing Cloudflare Environment Context');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        if (!env.DB) {
            console.error('Missing D1 Database Binding');
            return NextResponse.json({ error: 'Database configuration error' }, { status: 500 });
        }

        const body = await request.json();
        const validatedData = checkoutSchema.parse(body);

        const leadId = crypto.randomUUID();
        const tosAcceptedAt = validatedData.tos_accepted ? new Date().toISOString() : null;

        // 1. Capture Lead in D1
        try {
            await env.DB.prepare(
                'INSERT INTO leads (id, email, address, sales_rep_id, tos_accepted_at) VALUES (?, ?, ?, ?, ?)'
            )
            .bind(leadId, validatedData.email, validatedData.address, validatedData.sales_rep_id || null, tosAcceptedAt)
            .run();
        } catch (dbError) {
            console.error('Failed to capture lead in D1:', dbError);
            // We continue even if lead capture fails to not block checkout, 
            // but in a production app we might want to know.
        }

        // 2. Initialize Stripe
        if (!env.STRIPE_SECRET_KEY) {
            console.error('Missing STRIPE_SECRET_KEY');
            return NextResponse.json({ error: 'Stripe configuration error' }, { status: 500 });
        }

        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
            // @ts-expect-error - Newer API version
            apiVersion: '2025-01-27.acacia',
        });

        // 3. Determine Price ID and Mode
        let priceId = '';
        let mode: Stripe.Checkout.SessionCreateParams['mode'] = 'subscription';
        const lineItems: Stripe.Checkout.SessionCreateParams['line_items'] = [];

        if (validatedData.frequency === 'monthly') {
            priceId = env.STRIPE_MONTHLY_PRICE_ID;
            mode = 'subscription';
        } else if (validatedData.frequency === 'quarterly') {
            priceId = env.STRIPE_QUARTERLY_PRICE_ID;
            mode = 'subscription';
        } else {
            priceId = env.STRIPE_ONETIME_PRICE_ID;
            mode = 'payment';
        }

        if (!priceId || priceId.includes('...')) {
            console.error(`Missing or invalid Price ID for frequency: ${validatedData.frequency}`);
            return NextResponse.json({ error: 'Pricing configuration error' }, { status: 500 });
        }

        // Add main service item
        if (mode === 'payment' && validatedData.setup_fee_override !== undefined) {
            // Fetch product ID if we have a placeholder or need the underlying product
            let productId: string;
            if (priceId.startsWith('price_')) {
                const price = await stripe.prices.retrieve(priceId);
                productId = price.product as string;
            } else {
                productId = priceId;
            }

            lineItems.push({
                price_data: {
                    currency: 'usd',
                    product: productId,
                    unit_amount: Math.round(validatedData.setup_fee_override * 100),
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
            const setupFeePriceId = env.STRIPE_SETUP_FEE_PRICE_ID;
            if (!setupFeePriceId || setupFeePriceId.includes('...')) {
                console.error('Missing or invalid STRIPE_SETUP_FEE_PRICE_ID');
                return NextResponse.json({ error: 'Setup fee configuration error' }, { status: 500 });
            }

            if (validatedData.setup_fee_override !== undefined) {
                // If override is provided, we use price_data to set a custom amount
                const price = await stripe.prices.retrieve(setupFeePriceId);
                lineItems.push({
                    price_data: {
                        currency: 'usd',
                        product: price.product as string,
                        unit_amount: Math.round(validatedData.setup_fee_override * 100),
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

        // 4. Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: mode,
            customer_creation: mode === 'payment' ? 'always' : undefined,
            subscription_data: mode === 'subscription' ? {
                trial_period_days: validatedData.frequency === 'monthly' ? 28 : 84,
            } : undefined,
            success_url: `${new URL(request.url).origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${new URL(request.url).origin}/signup`,
            customer_email: validatedData.email,
            metadata: {
                lead_id: leadId,
                sales_rep_id: validatedData.sales_rep_id || '',
                phone_number: validatedData.phone_number,
                trash_day: validatedData.trash_day,
                provider_name: validatedData.provider_name,
                bin_quantity: validatedData.bin_quantity.toString(),
                lat: validatedData.lat?.toString() || '',
                lng: validatedData.lng?.toString() || '',
                frequency: validatedData.frequency,
                tos_accepted_at: tosAcceptedAt || '',
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        console.error('Checkout error:', error);
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues }, { status: 400 });
        }
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
