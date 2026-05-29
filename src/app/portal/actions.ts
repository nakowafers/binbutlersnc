'use server';

import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/types';
import { StripeAdapter } from '@/lib/payment/StripeAdapter';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { redirect } from 'next/navigation';

export async function createBillingPortalSession() {
    const session = await auth();
    
    if (!session?.user?.email) {
        throw new Error('Unauthorized: No active session');
    }

    const { env } = (getRequestContext() as unknown) as { env: Env };

    const db = new D1DatabaseAdapter(env.DB);

    // 1. Fetch Stripe Customer ID from DB via Adapter
    const customer = await db.getCustomerByEmail(session.user.email);

    // 2. Initialize Payment Service
    const paymentService = new StripeAdapter({
        secretKey: env.STRIPE_SECRET_KEY,
        monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
        quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
        oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
        setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
    });

    let stripeCustomerId = customer?.stripe_customer_id;

    // 3. Fallback: If webhook failed, try to find them directly in Stripe by email
    if (!stripeCustomerId) {
        console.log(`Stripe ID missing in DB for ${session.user.email}. Querying Stripe directly...`);
        const customerId = await paymentService.getCustomerIdByEmail(session.user.email);

        if (customerId) {
            stripeCustomerId = customerId;
            
            // Auto-heal the database via Adapter
            if (customer?.id) {
                await db.updateCustomerStripeId(customer.id, stripeCustomerId);
                console.log(`Auto-healed DB: Saved Stripe ID ${stripeCustomerId} for customer ${customer.id}`);
            }
        }
    }

    if (!stripeCustomerId) {
        throw new Error('Customer record not found or missing Stripe ID');
    }

    // 4. Create Portal Session via Adapter
    const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:8788' : 'https://binbutlersnc.com';
    
    const { url } = await paymentService.createBillingPortalSession(stripeCustomerId, `${baseUrl}/portal`);

    if (!url) {
        throw new Error('Failed to create billing portal session URL');
    }

    // Redirect the user directly to the Stripe portal
    redirect(url);
}
