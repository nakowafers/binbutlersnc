import type { BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import fs from 'fs';
import path from 'path';

function readDevVar(key: string): string {
    const devVarsPath = path.join(process.cwd(), '.dev.vars');
    const contents = fs.readFileSync(devVarsPath, 'utf8');
    const match = contents.match(new RegExp(`^${key}=(.*)$`, 'm'));
    const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');

    if (!value) {
        throw new Error(`${key} is required in .dev.vars for e2e auth`);
    }

    return value;
}

export async function addAuthSessionCookie(
    context: BrowserContext,
    user: { id: string; email: string; name: string; role: 'ADMIN' | 'CUSTOMER' },
) {
    const cookieName = '__Secure-authjs.session-token';
    const expires = Math.floor(Date.now() / 1000) + 60 * 60;
    const value = await encode({
        secret: readDevVar('AUTH_SECRET'),
        salt: cookieName,
        maxAge: 60 * 60,
        token: {
            sub: user.id,
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        },
    });

    await context.addCookies([{
        name: cookieName,
        value,
        url: 'https://localhost:8788',
        expires,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
    }]);
}
