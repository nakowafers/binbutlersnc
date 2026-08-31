import { z } from 'zod';
import { Env } from '@/lib/types';
import { normalizeAddress, normalizeEmail } from '@/lib/utils';
import { normalizeSalesRepId } from '@/lib/sales-rep';
import { pricingVersionSchema } from '@/lib/checkout/pricingVersion';
import { assertEasternServiceDate, actualServiceDate } from '@/lib/service-cycle/dates';

export const checkoutSchema = z.object({
    pricing_version: pricingVersionSchema,
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
    d2d_service_completed: z.boolean().optional().default(false),
    d2d_service_date: z.string().optional(),
    tos_accepted: z.boolean().optional().default(false),
    age_confirmed: z.boolean().optional().default(false),
    contact_consent: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
    if (data.d2d_service_completed) {
        if (!data.sales_rep_id) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['sales_rep_id'],
                message: 'A Sales Rep ID is required to attest immediate D2D service',
            });
        }

        if (!data.d2d_service_date) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['d2d_service_date'],
                message: 'An actual Eastern Service Date is required for immediate D2D service',
            });
        } else {
            try {
                assertEasternServiceDate(data.d2d_service_date);
                if (data.d2d_service_date > actualServiceDate(new Date())) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['d2d_service_date'],
                        message: 'Immediate D2D service cannot be attested for a future date',
                    });
                }
            } catch {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['d2d_service_date'],
                    message: 'An actual canonical Eastern Service Date is required for immediate D2D service',
                });
            }
        }

        if (data.next_service_date && data.next_service_date !== data.d2d_service_date) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['next_service_date'],
                message: 'Immediate D2D service cannot also have a different First Service Date',
            });
        }
    }

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

    if (data.frequency === 'quarterly' && !env.STRIPE_QUARTERLY_PRICE_ID) {
        missing.push('STRIPE_QUARTERLY_PRICE_ID');
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
