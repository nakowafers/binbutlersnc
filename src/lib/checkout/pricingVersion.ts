import { z } from 'zod';
import { PRICING_VERSION } from '@/lib/pricing';

export const pricingVersionSchema = z.literal(PRICING_VERSION);
export const PRICING_VERSION_MISMATCH_CODE = 'pricing_version_mismatch';
export const PRICING_VERSION_MISMATCH_MESSAGE = 'Pricing has changed. Please review the latest prices before checkout.';

const checkoutPricingVersionSchema = z.object({
    pricing_version: pricingVersionSchema,
});

export function hasCurrentPricingVersion(body: unknown): boolean {
    return checkoutPricingVersionSchema.safeParse(body).success;
}
