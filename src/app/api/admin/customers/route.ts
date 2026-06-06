import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';

export const runtime = 'edge';

export async function GET() {
    try {
        const session = await auth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        const db = new D1DatabaseAdapter(env.DB);
        const customers = await db.getAllCustomersWithDetails();

        return NextResponse.json(customers);
    } catch (error) {
        console.error('Admin customers fetch error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
