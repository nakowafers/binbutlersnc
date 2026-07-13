import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/types';
import { createDatabase } from '@/lib/backend/createServices';
import { RoutingWebhookEvent, RoutingWebhookService } from '@/lib/webhooks/routing/RoutingWebhookService';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const { env } = (getRequestContext() as unknown) as { env: Env };
        
        const payloadStr = await request.text();
        const signature = request.headers.get('x-routific-signature') || '';
        
        const secret = (env as Env & { ROUTIFIC_WEBHOOK_SECRET?: string }).ROUTIFIC_WEBHOOK_SECRET;
        if (!secret) {
            console.error('ROUTIFIC_WEBHOOK_SECRET is not configured.');
            return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const db = createDatabase(env);
        const webhookService = new RoutingWebhookService(db);

        if (!(await webhookService.verifySignature(payloadStr, signature, secret))) {
            return new Response(JSON.stringify({ error: 'Invalid signature' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const body = JSON.parse(payloadStr) as RoutingWebhookEvent;
        await webhookService.handleEvent(body);

        return new Response(JSON.stringify({ received: true }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (error) {
        console.error('Routific webhook error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
}
