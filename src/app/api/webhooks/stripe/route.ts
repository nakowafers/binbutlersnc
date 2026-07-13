import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/types';
import { WebhookHttpError } from '@/lib/webhooks/WebhookHttpError';
import { StripeWebhookService } from '@/lib/webhooks/stripe/StripeWebhookService';

export const runtime = 'edge';

export async function POST(request: Request) {
    let env: Env | undefined;
    let eventId: string | null = null;

    try {
        const context = getRequestContext() as unknown as { env: Env };
        env = context?.env;
        if (!env) {
            throw new Error('Cloudflare environment not detected');
        }
        const body = await request.text();
        const signature = request.headers.get('stripe-signature') || '';

        const webhookService = new StripeWebhookService(env);
        eventId = await webhookService.process(body, signature, id => {
            eventId = id;
        });

        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        if (eventId && env) {
await new StripeWebhookService(env).releaseClaim(eventId);
        }

        if (error instanceof WebhookHttpError) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: error.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.error('Webhook error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
