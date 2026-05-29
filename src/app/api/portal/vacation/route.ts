import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { validateOrigin } from '@/lib/csrf';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        if (!validateOrigin(request)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        const body = await request.json() as { subscriptionId: string; isPaused: boolean };

        if (!body.subscriptionId || body.isPaused === undefined) {
            return NextResponse.json({ error: 'Missing subscriptionId or isPaused' }, { status: 400 });
        }

        const db = new D1DatabaseAdapter(env.DB);

        // 1. Fetch customer from DB using session email
        const customer = await db.getCustomerByEmail(session.user.email);

        if (!customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        // 2. Fetch the subscription to verify it belongs to the customer
        const subscription = await db.getSubscriptionByIdAndCustomer(body.subscriptionId, customer.id);

        if (!subscription) {
            return NextResponse.json({ error: 'Subscription not found or unauthorized' }, { status: 404 });
        }

        // 3. Update is_paused field via Adapter
        // D1 uses SQLite, where BOOLEAN is mapped to 0 or 1
        const targetPause = body.isPaused ? 1 : 0;
        await db.updateSubscriptionPauseStatus(body.subscriptionId, targetPause);

        return NextResponse.json({ success: true, isPaused: body.isPaused });
    } catch (error) {
        console.error('Vacation Mode error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
