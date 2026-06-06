import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { validateOrigin } from '@/lib/csrf';

export const runtime = 'edge';

export async function DELETE(request: Request) {
    try {
        if (!validateOrigin(request)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const session = await auth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json() as { customerId: string };

        if (!body.customerId) {
            return NextResponse.json({ error: 'Missing customerId' }, { status: 400 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        const db = new D1DatabaseAdapter(env.DB);

        // Verify subscription is canceled before allowing delete
        const customers = await db.getAllCustomersWithDetails();
        const customer = customers.find(c => c.id === body.customerId);

        if (!customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        if (customer.subscription_status !== 'canceled') {
            return NextResponse.json(
                { error: 'Only customers with canceled subscriptions can be deleted' },
                { status: 403 }
            );
        }

        await db.deleteCustomerCascade(body.customerId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Admin customer delete error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
