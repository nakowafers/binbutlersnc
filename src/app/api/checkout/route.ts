import { getRequestContext } from '@cloudflare/next-on-pages';
import { z } from 'zod';
import { Env } from '@/lib/types';
import { StripeAdapter } from '@/lib/payment/StripeAdapter';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';

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

        // 1. Capture Lead in Database via Adapter
        if (env.DB) {
            try {
                const db = new D1DatabaseAdapter(env.DB);
                await db.createLead(leadId, validatedData.email, validatedData.address, validatedData.sales_rep_id || null, tosAcceptedAt);
            } catch (dbError) {
                console.error('Lead capture failed:', dbError);
            }
        } else {
            console.warn('DB binding missing, skipping lead capture');
        }

        // 2. Initialize Payment Service
        const stripeKey = env.STRIPE_SECRET_KEY;
        if (!stripeKey || stripeKey.includes('sk_test_...')) {
            return new Response(JSON.stringify({ error: 'Stripe API key not configured' }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const paymentService = new StripeAdapter({
            secretKey: stripeKey,
            monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
            quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
            oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
            setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
        });

        // 3. Create Payment/Checkout Session via Adapter
        const { url } = await paymentService.createCheckoutSession({
            email: validatedData.email,
            frequency: validatedData.frequency,
            binQuantity: validatedData.bin_quantity,
            phoneNumber: validatedData.phone_number,
            trashDay: validatedData.trash_day,
            providerName: validatedData.provider_name,
            salesRepId: validatedData.sales_rep_id,
            setup_fee_override: validatedData.setup_fee_override,
            tosAcceptedAt: tosAcceptedAt,
            lat: validatedData.lat,
            lng: validatedData.lng,
            leadId: leadId,
            successUrl: `${new URL(request.url).origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${new URL(request.url).origin}/signup`,
        });

        if (!url) {
            throw new Error('Failed to generate checkout session URL');
        }

        return new Response(JSON.stringify({ url }), { 
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
