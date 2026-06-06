import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { validateOrigin } from '@/lib/csrf';

export const runtime = 'edge';

export async function PATCH(request: Request) {
    try {
        if (!validateOrigin(request)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const session = await auth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json() as { addressId: string; notes: string };

        if (!body.addressId || body.notes === undefined) {
            return NextResponse.json({ error: 'Missing addressId or notes' }, { status: 400 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        const db = new D1DatabaseAdapter(env.DB);
        await db.updateAddressNotes(body.addressId, body.notes);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Admin notes update error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
