import { getRequestContext } from '@cloudflare/next-on-pages';
import { encode } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import { Env } from '@/lib/types';

export const runtime = 'edge';

function isLocalHost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    if (!isLocalHost(url.hostname)) {
        return new NextResponse('Not found', { status: 404 });
    }

    const email = url.searchParams.get('email') || 'admin@example.com';
    const next = url.searchParams.get('next') || '/admin/dispatch?driver=EYANNI';
    const { env } = (getRequestContext() as unknown) as { env: Env };

    const rep = await env.DB.prepare(
        `SELECT id, email, is_admin
         FROM sales_reps
         WHERE LOWER(email) = LOWER(?) AND is_admin = 1 AND COALESCE(is_active, 1) = 1`
    ).bind(email).first<{ id: string; email: string; is_admin: number }>();

    if (!rep?.email) {
        return new NextResponse('Local dev login requires an active admin sales_rep email.', { status: 403 });
    }

    const cookieName = url.protocol === 'https:' ? '__Secure-authjs.session-token' : 'authjs.session-token';
    const maxAge = 60 * 60 * 8;
    const token = await encode({
        secret: env.AUTH_SECRET,
        salt: cookieName,
        maxAge,
        token: {
            sub: rep.id,
            id: rep.id,
            email: rep.email,
            name: rep.id,
            role: 'ADMIN',
        },
    });

    const response = NextResponse.redirect(new URL(next, url.origin));
    response.cookies.set(cookieName, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: url.protocol === 'https:',
        path: '/',
        maxAge,
    });

    return response;
}
