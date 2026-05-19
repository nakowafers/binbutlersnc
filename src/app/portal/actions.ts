'use server';

import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import Stripe from 'stripe';
import { Env, Customer } from '@/lib/types';
import { redirect } from 'next/navigation';

export async function createBillingPortalSession() {
    const session = await auth();
    
    if (!session?.user?.email) {
        throw new Error('Unauthorized: No active session');
    }

    const { env } = (getRequestContext() as unknown) as { env: Env };

    // 1. Fetch Stripe Customer ID from D1
    const customer = await env.DB.prepare('SELECT id, stripe_customer_id FROM customers WHERE email = ?')
        .bind(session.user.email)
        .first<Customer>();

    // 2. Initialize Stripe
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
        // @ts-expect-error - Newer API version
        apiVersion: '2025-01-27.acacia',
    });

    let stripeCustomerId = customer?.stripe_customer_id;

    // 3. Fallback: If webhook failed, try to find them directly in Stripe by email
    if (!stripeCustomerId) {
        console.log(`Stripe ID missing in DB for ${session.user.email}. Querying Stripe directly...`);
        const stripeCustomers = await stripe.customers.list({
            email: session.user.email,
            limit: 1,
        });

        if (stripeCustomers.data.length > 0) {
            stripeCustomerId = stripeCustomers.data[0].id;
            
            // Auto-heal the database
            if (customer?.id) {
                await env.DB.prepare('UPDATE customers SET stripe_customer_id = ? WHERE id = ?')
                    .bind(stripeCustomerId, customer.id)
                    .run();
                console.log(`Auto-healed DB: Saved Stripe ID ${stripeCustomerId} for customer ${customer.id}`);
            }
        }
    }

    if (!stripeCustomerId) {
        throw new Error('Customer record not found or missing Stripe ID');
    }

    // 4. Create Portal Session
    const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:8788' : 'https://binbutlersnc.com';
    
    const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${baseUrl}/portal`,
    });

    // Redirect the user directly to the Stripe portal
    redirect(portalSession.url);
}
