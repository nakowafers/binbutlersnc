import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env } from '@/lib/types';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
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

        await env.DB.prepare(
            'INSERT INTO global_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP'
        )
        .bind(body.key, body.value)
        .run();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Admin settings error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
