import { z } from 'zod';
import { Env } from '@/lib/types';
import { normalizeAddress, normalizeEmail } from '@/lib/utils';
import { normalizeSalesRepId } from '@/lib/sales-rep';

export const checkoutSchema = z.object({
    email: z.string().email(),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    address: z.string().min(5),
    lat: z.number(),
    lng: z.number(),
    zip_code: z.string().optional(),
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

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export function normalizeCheckoutPayload(body: unknown): CheckoutInput {
    const rawBody = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (typeof rawBody.email === 'string') {
        rawBody.email = normalizeEmail(rawBody.email);
    }
    if (typeof rawBody.address === 'string') {
        rawBody.address = normalizeAddress(rawBody.address);
    }

    const data = checkoutSchema.parse(rawBody);
    data.email = normalizeEmail(data.email);
    data.address = normalizeAddress(data.address);
    return data;
}

export function getMissingStripeConfig(env: Env, data: CheckoutInput): string[] {
    const missing: string[] = [];
    const envRecord = env as unknown as Record<string, string | undefined>;

    if (!env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.includes('sk_test_...')) {
        missing.push('STRIPE_SECRET_KEY');
    }

    if (data.frequency === 'monthly' && !env.STRIPE_MONTHLY_PRICE_ID) {
        missing.push('STRIPE_MONTHLY_PRICE_ID');
    }

    if (data.frequency === 'bimonthly' && !env.STRIPE_BIMONTHLY_PRICE_ID) {
        missing.push('STRIPE_BIMONTHLY_PRICE_ID');
    }

    if (data.frequency === 'quarterly' && !env.STRIPE_QUARTERLY_PRICE_ID_V2) {
        missing.push('STRIPE_QUARTERLY_PRICE_ID_V2');
    }

    if (data.frequency === 'one-time' && !env.STRIPE_ONETIME_PRICE_ID) {
        missing.push('STRIPE_ONETIME_PRICE_ID');
    }

    if (data.frequency !== 'one-time' && !env.STRIPE_SETUP_FEE_PRICE_ID) {
        missing.push('STRIPE_SETUP_FEE_PRICE_ID');
    }

    if (data.frequency !== 'one-time' && data.bin_quantity > 2) {
        const extraBinKey = data.frequency === 'monthly'
            ? 'STRIPE_EXTRA_BIN_MONTHLY_PRICE_ID'
            : data.frequency === 'bimonthly'
                ? 'STRIPE_EXTRA_BIN_BIMONTHLY_PRICE_ID'
                : 'STRIPE_EXTRA_BIN_QUARTERLY_PRICE_ID';

        if (!envRecord[extraBinKey]) {
            missing.push(extraBinKey);
        }
    }

    return missing;
}
