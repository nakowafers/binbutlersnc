import { getRequestContext } from '@cloudflare/next-on-pages';
import { z } from 'zod';
import { Env } from '@/lib/types';
import { normalizeEmail, normalizeAddress } from '@/lib/utils';
import { StripeAdapter } from '@/lib/payment/StripeAdapter';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { normalizeSalesRepId } from '@/lib/sales-rep';

export const runtime = 'edge';

const checkoutSchema = z.object({
    email: z.string().email(),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    address: z.string().min(5),
    lat: z.number(),
    lng: z.number(),
    zip_code: z.string().length(5).optional(),
    phone_number: z.string(),
    trash_day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI']),
    notes: z.string().optional(),
    scent_preference: z.enum(['lavender', 'ocean_breeze', 'tropical']),
    bin_quantity: z.number().min(1),
    frequency: z.enum(['monthly', 'bimonthly', 'quarterly', 'one-time']),
    sales_rep_id: z.string().optional().transform(val => normalizeSalesRepId(val) ?? undefined),
    setup_fee_override: z.number().min(0).optional(),
    next_service_date: z.string().optional(),
    tos_accepted: z.boolean().optional().default(false),
    age_confirmed: z.boolean().optional().default(false),
    contact_consent: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
    if (data.frequency === 'one-time') {
        return;
    }

    if (!data.tos_accepted) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['tos_accepted'],
            message: 'You must accept the Terms of Service',
        });
    }

    if (!data.age_confirmed) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['age_confirmed'],
            message: 'You must confirm you are 18 or older',
        });
    }

    if (!data.contact_consent) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['contact_consent'],
            message: 'You must agree to be contacted',
        });
    }
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

        const rawBody = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
        if (typeof rawBody.email === 'string') {
            rawBody.email = normalizeEmail(rawBody.email);
        }
        if (typeof rawBody.address === 'string') {
            rawBody.address = normalizeAddress(rawBody.address);
        }
        const validatedData = checkoutSchema.parse(rawBody);
        validatedData.email = normalizeEmail(validatedData.email);
        validatedData.address = normalizeAddress(validatedData.address);

        if (validatedData.zip_code) {
            const serviceableZips = (env.SERVICEABLE_ZIP_CODES || '').split(',').map(z => z.trim());
            if (!serviceableZips.includes(validatedData.zip_code)) {
                return new Response(JSON.stringify({ error: 'Sorry, we don\'t service this area yet' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Silently use default fee unless a sales rep is authorized to override it.
        if (validatedData.setup_fee_override !== undefined) {
            if (!validatedData.sales_rep_id || !env?.DB) {
                validatedData.setup_fee_override = undefined;
            }
        }

        if (validatedData.sales_rep_id && validatedData.setup_fee_override !== undefined && env?.DB) {
            try {
                const db = new D1DatabaseAdapter(env.DB);
                const allowed = await db.isSalesRepAllowedToOverrideFee(validatedData.sales_rep_id);
                if (!allowed) {
                    validatedData.setup_fee_override = undefined;
                }
            } catch (dbError) {
                console.error('Sales rep fee override check failed:', dbError);
                validatedData.setup_fee_override = undefined;
            }
        }

        const tosAcceptedAt = validatedData.tos_accepted ? new Date().toISOString() : null;
        let leadId: string = '';

        // 1. Get or create Lead in Database via Adapter
        if (env.DB) {
            try {
                const db = new D1DatabaseAdapter(env.DB);
                const existingLead = await db.getLeadByEmail(validatedData.email);
                if (existingLead) {
                    leadId = existingLead.id;
                    await db.updateLeadMetadata(
                        leadId,
                        validatedData.first_name,
                        validatedData.last_name,
                        validatedData.address,
                        validatedData.sales_rep_id || null,
                        tosAcceptedAt
                    );
                } else {
                    leadId = crypto.randomUUID();
                    await db.createLead(leadId, validatedData.email, validatedData.address, validatedData.first_name, validatedData.last_name, validatedData.sales_rep_id || null, tosAcceptedAt);
                }
            } catch (dbError) {
                console.error('Lead capture failed:', dbError);
            }
        } else {
            console.warn('DB binding missing, skipping lead capture');
        }

        if (!leadId) {
            leadId = crypto.randomUUID();
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
            bimonthlyPriceId: env.STRIPE_BIMONTHLY_PRICE_ID,
            quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
            oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
            setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
            extraBinMonthlyPriceId: env.STRIPE_EXTRA_BIN_MONTHLY_PRICE_ID,
            extraBinBimonthlyPriceId: env.STRIPE_EXTRA_BIN_BIMONTHLY_PRICE_ID,
            extraBinQuarterlyPriceId: env.STRIPE_EXTRA_BIN_QUARTERLY_PRICE_ID,
        });

        // 3. Create Payment/Checkout Session via Adapter
        const { url } = await paymentService.createCheckoutSession({
            email: validatedData.email,
            firstName: validatedData.first_name,
            lastName: validatedData.last_name,
            frequency: validatedData.frequency,
            binQuantity: validatedData.bin_quantity,
            phoneNumber: validatedData.phone_number,
            trashDay: validatedData.trash_day,
            notes: validatedData.notes || '',
            scentPreference: validatedData.scent_preference,
            salesRepId: validatedData.sales_rep_id,
            setup_fee_override: validatedData.setup_fee_override,
            tosAcceptedAt: tosAcceptedAt,
            nextServiceDate: validatedData.next_service_date,
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
        const msg = error instanceof z.ZodError ? error.issues.map(i => i.message).join('; ') : ((error as Error).message || 'Internal Server Error');
        return new Response(JSON.stringify({ error: msg }), { 
            status, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
