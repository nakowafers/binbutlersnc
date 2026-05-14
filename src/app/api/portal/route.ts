import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/auth';
import { Env, Customer } from '@/lib/types';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        
        // 1. Fetch Stripe Customer ID from D1
        const customer = await env.DB.prepare('SELECT stripe_customer_id FROM customers WHERE email = ?')
            .bind(session.user.email)
            .first<Customer>();

        if (!customer || !customer.stripe_customer_id) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        // 2. Initialize Stripe
        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
            // @ts-expect-error - Newer API version
            apiVersion: '2025-01-27.acacia',
        });

        // 3. Create Portal Session
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customer.stripe_customer_id,
            return_url: `${new URL(request.url).origin}/portal`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (error) {
        console.error('Portal error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
