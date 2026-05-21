import { getRequestContext } from '@cloudflare/next-on-pages';
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
        let env: Env | undefined;
        try {
            const context = getRequestContext() as unknown as { env: Env };
            env = context?.env;
        } catch (ctxError) {
            console.error('Context access failed:', ctxError);
        }

        if (!env) {
            return new Response(JSON.stringify({ error: 'Cloudflare environment not detected' }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Parse body safely
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const validatedData = checkoutSchema.parse(body);

        const leadId = crypto.randomUUID();
        const tosAcceptedAt = validatedData.tos_accepted ? new Date().toISOString() : null;

        // 1. Capture Lead in D1
        if (env.DB) {
            try {
                await env.DB.prepare(
                    'INSERT INTO leads (id, email, address, sales_rep_id, tos_accepted_at) VALUES (?, ?, ?, ?, ?)'
                )
                .bind(leadId, validatedData.email, validatedData.address, validatedData.sales_rep_id || null, tosAcceptedAt)
                .run();
            } catch (dbError) {
                console.error('Lead capture failed:', dbError);
            }
        } else {
            console.warn('DB binding missing, skipping lead capture');
        }

        // 2. Initialize Stripe
        const stripeKey = env.STRIPE_SECRET_KEY;
        if (!stripeKey || stripeKey.includes('sk_test_...')) {
            return new Response(JSON.stringify({ error: 'Stripe API key not configured' }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const stripe = new Stripe(stripeKey, {
            // @ts-expect-error - Newer API version
            apiVersion: '2025-01-27.acacia',
        });

        // 3. Determine Price ID and Mode
        let priceId: string | undefined;
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

        if (!priceId || typeof priceId !== 'string' || priceId.includes('...')) {
            return new Response(JSON.stringify({ error: `Price ID not configured for ${validatedData.frequency}` }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Add main service item
        if (mode === 'payment' && validatedData.setup_fee_override !== undefined) {
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
            if (!setupFeePriceId || typeof setupFeePriceId !== 'string' || setupFeePriceId.includes('...')) {
                return new Response(JSON.stringify({ error: 'Setup fee price ID not configured' }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }

            if (validatedData.setup_fee_override !== undefined) {
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

        return new Response(JSON.stringify({ url: session.url }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (error) {
        console.error('Checkout failure:', error);
        const status = error instanceof z.ZodError ? 400 : 500;
        const msg = error instanceof z.ZodError ? error.issues : ((error as Error).message || 'Internal Server Error');
        return new Response(JSON.stringify({ error: msg }), { 
            status, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
