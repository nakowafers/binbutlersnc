import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env, Customer, Subscription } from '@/lib/types';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        const body = await request.json() as { subscriptionId: string; isPaused: boolean };

        if (!body.subscriptionId || body.isPaused === undefined) {
            return NextResponse.json({ error: 'Missing subscriptionId or isPaused' }, { status: 400 });
        }

        // 1. Fetch customer from D1 using session email
        const customer = await env.DB.prepare('SELECT * FROM customers WHERE email = ?')
            .bind(session.user.email)
            .first<Customer>();

        if (!customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        // 2. Fetch the subscription to verify it belongs to the customer
        const subscription = await env.DB.prepare('SELECT * FROM subscriptions WHERE id = ? AND customer_id = ?')
            .bind(body.subscriptionId, customer.id)
            .first<Subscription>();

        if (!subscription) {
            return NextResponse.json({ error: 'Subscription not found or unauthorized' }, { status: 404 });
        }

        // 3. Update is_paused field
        // D1 uses SQLite, where BOOLEAN is mapped to 0 or 1
        const targetPause = body.isPaused ? 1 : 0;
        await env.DB.prepare('UPDATE subscriptions SET is_paused = ? WHERE id = ?')
            .bind(targetPause, body.subscriptionId)
            .run();

        return NextResponse.json({ success: true, isPaused: body.isPaused });
    } catch (error) {
        console.error('Vacation Mode error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
