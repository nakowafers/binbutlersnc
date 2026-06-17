import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/types';

export const runtime = 'edge';

export async function GET() {
    let env: Env | undefined;
    try {
        const context = getRequestContext() as unknown as { env: Env };
        env = context?.env;
    } catch {
        // running outside Cloudflare (e.g. tests)
    }

    const zips = (env?.SERVICEABLE_ZIP_CODES || '').split(',').map(z => z.trim()).filter(Boolean);
    return new Response(JSON.stringify({ zips }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
