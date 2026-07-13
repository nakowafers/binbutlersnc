import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env } from '@/lib/types';
import { createAdminCustomerService } from '@/lib/admin/createAdminServices';

export const runtime = 'edge';

export async function GET() {
    try {
        const session = await auth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        const customers = await createAdminCustomerService(env).listCustomers();

        return NextResponse.json(customers);
    } catch (error) {
        console.error('Admin customers fetch error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
