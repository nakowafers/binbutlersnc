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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        const body = await request.json() as { key: string; value: string };

        if (!body.key || body.value === undefined) {
            return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });
        }

        // Whitelist allowed settings keys to prevent injection
        const ALLOWED_KEYS = ['holiday_offset_hours'];
        if (!ALLOWED_KEYS.includes(body.key)) {
            return NextResponse.json({ error: 'Invalid setting key' }, { status: 400 });
        }

        const db = new D1DatabaseAdapter(env.DB);
        await db.setGlobalSetting(body.key, body.value);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Admin settings error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
