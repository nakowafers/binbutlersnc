import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { normalizeSalesRepId } from '@/lib/sales-rep';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const context = getRequestContext() as unknown as { env: Env };
        const env = context?.env;

        if (!env) {
            return new Response(JSON.stringify({ allowed: false }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let body: { sales_rep_id?: string };
        try {
            body = await request.json();
        } catch {
            return new Response(JSON.stringify({ allowed: false }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (!body.sales_rep_id) {
            return new Response(JSON.stringify({ allowed: false }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let allowed = false;
        if (env.DB) {
            try {
                const db = new D1DatabaseAdapter(env.DB);
                allowed = await db.isSalesRepAllowedToOverrideFee(normalizeSalesRepId(body.sales_rep_id) ?? '');
            } catch (dbError) {
                console.error('Sales rep check failed:', dbError);
            }
        }

        return new Response(JSON.stringify({ allowed }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Check sales rep failure:', error);
        return new Response(JSON.stringify({ allowed: false }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
