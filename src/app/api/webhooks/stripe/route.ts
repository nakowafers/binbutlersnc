import Stripe from 'stripe';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { StripeAdapter } from '@/lib/payment/StripeAdapter';
import { RoutificAdapter } from '@/lib/routing/RoutificAdapter';
import { SubscriptionLifecycle } from '@/lib/payment/SubscriptionLifecycle';
import { WebhookHttpError } from '@/lib/webhooks/WebhookHttpError';

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

        const paymentService = new StripeAdapter({
            secretKey: env.STRIPE_SECRET_KEY,
            monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
            bimonthlyPriceId: env.STRIPE_BIMONTHLY_PRICE_ID,
            quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
            oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
            setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
        });

        let event: Stripe.Event;

        const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
        console.log(`[Webhook Debug] Secret starts with: ${webhookSecret?.substring(0, 10)}...`);
        console.log(`[Webhook Debug] Secret length: ${webhookSecret?.length}`);
        console.log(`[Webhook Debug] Signature header: ${signature?.substring(0, 30)}...`);
        console.log(`[Webhook Debug] Body length: ${body?.length}`);

        if (!webhookSecret || !webhookSecret.startsWith('whsec_')) {
            console.error(`[Webhook Debug] Invalid webhook secret format. Value starts with: "${webhookSecret?.substring(0, 10)}"`);
            return new Response(JSON.stringify({ error: 'Webhook secret misconfigured' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        try {
            event = await paymentService.verifyWebhookEvent(
                body,
                signature,
                webhookSecret
            ) as Stripe.Event;
        } catch (err) {
            const error = err as Error;
            console.error(`Webhook signature verification failed.`);
            console.error(`  Error name: ${error.name}`);
            console.error(`  Error message: ${error.message}`);
            console.error(`  Full error: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
            return new Response(JSON.stringify({ error: 'Webhook signature verification failed' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const db = new D1DatabaseAdapter(env.DB);
        const routing = new RoutificAdapter(env.ROUTIFIC_API_KEY, env.ROUTIFIC_WORKSPACE_ID);
        const lifecycle = new SubscriptionLifecycle(db, db, db, db, paymentService, routing);

        eventId = event.id;
        await lifecycle.processEvent(event);

        await env.DB.prepare(
            'DELETE FROM webhook_events WHERE created_at < unixepoch() - 2592000'
        ).run();

        await env.DB.prepare(
            'DELETE FROM routific_dispatches WHERE service_date < ?'
        ).bind(new Date().toISOString().split('T')[0]).run();

        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        if (eventId && env) {
            try {
                await env.DB.prepare('DELETE FROM webhook_events WHERE id = ?').bind(eventId).run();
            } catch (cleanupError) {
                console.error('Failed to release webhook event claim:', cleanupError);
            }
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
