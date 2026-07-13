import { getRequestContext } from '@cloudflare/next-on-pages';
import { z } from 'zod';
import { Env } from '@/lib/types';
import { CheckoutHttpError } from '@/lib/checkout/CheckoutService';
import { createCheckoutService } from '@/lib/checkout/createCheckoutService';
import { normalizeCheckoutPayload } from '@/lib/checkout/checkoutSchema';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        let env: Env | undefined;
        try {
            const context = getRequestContext() as unknown as { env: Env };
            env = context?.env;
        } catch (ctxError) {
            console.error('Context access failed:', ctxError);
        }

        if (!env) {
            return new Response(JSON.stringify({ error: 'Cloudflare environment not detected' }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        // Parse body safely
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const validatedData = normalizeCheckoutPayload(body);
        const { url } = await createCheckoutService(env).createCheckout(
            validatedData,
            new URL(request.url).origin
        );

        return new Response(JSON.stringify({ url }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (error) {
        console.error('Checkout failure:', error);
        const status = error instanceof z.ZodError ? 400 : error instanceof CheckoutHttpError ? error.status : 500;
        const msg = error instanceof z.ZodError ? error.issues.map(i => i.message).join('; ') : ((error as Error).message || 'Internal Server Error');
        return new Response(JSON.stringify({ error: msg }), { 
            status, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
