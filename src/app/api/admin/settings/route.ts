import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env } from '@/lib/types';
import { validateOrigin } from '@/lib/csrf';
import { AdminSettingsError } from '@/lib/admin/AdminSettingsService';
import { createAdminSettingsService } from '@/lib/admin/createAdminServices';

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

        await createAdminSettingsService(env).updateSetting(body.key, body.value);

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof AdminSettingsError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }

        console.error('Admin settings error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
