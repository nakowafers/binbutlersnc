'use server';

import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/types';
import { createPaymentService } from '@/lib/backend/createServices';
import { redirect } from 'next/navigation';

export async function createBillingPortal(sessionId: string) {
    const { env } = (getRequestContext() as unknown) as { env: Env };

    const paymentService = createPaymentService(env);

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
