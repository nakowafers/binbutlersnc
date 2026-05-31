'use server';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/types';
import { StripeAdapter } from '@/lib/payment/StripeAdapter';
import { redirect } from 'next/navigation';

export async function createBillingPortal(sessionId: string) {
    const { env } = (getRequestContext() as unknown) as { env: Env };

    const paymentService = new StripeAdapter({
        secretKey: env.STRIPE_SECRET_KEY,
        monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
        quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
        oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
        setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
    });

    const session = await paymentService.retrieveCheckoutSession(sessionId);

    if (!session.customer) {
        throw new Error('No Stripe customer found for this session');
    }

    const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:8788' : 'https://binbutlersnc.com';

    const { url } = await paymentService.createBillingPortalSession(session.customer, `${baseUrl}/`);

    if (!url) {
        throw new Error('Failed to create billing portal session URL');
    }

    redirect(url);
}
