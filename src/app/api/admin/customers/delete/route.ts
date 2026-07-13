import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env } from '@/lib/types';
import { validateOrigin } from '@/lib/csrf';
import { AdminServiceError } from '@/lib/admin/AdminCustomerService';
import { createAdminCustomerService } from '@/lib/admin/createAdminServices';

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
        await createAdminCustomerService(env).deleteCustomer(body.customerId);

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof AdminServiceError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }

        console.error('Admin customer delete error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
