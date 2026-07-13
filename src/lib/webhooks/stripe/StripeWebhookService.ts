import Stripe from 'stripe';
import { createPaymentService, createSubscriptionLifecycle } from '@/lib/backend/createServices';
import { Env } from '@/lib/types';
import { WebhookHttpError } from '@/lib/webhooks/WebhookHttpError';
import { WebhookCleanupService } from './WebhookCleanupService';

export class StripeWebhookService {
    private readonly cleanupService: WebhookCleanupService;

    constructor(private readonly env: Env) {
        this.cleanupService = new WebhookCleanupService(env);
    }

    async process(payload: string, signature: string, onVerified?: (eventId: string) => void): Promise<string> {
        const event = await this.verifyEvent(payload, signature);
        onVerified?.(event.id);
        await createSubscriptionLifecycle(this.env).processEvent(event);
        await this.cleanupService.cleanupProcessedEvents();
        await this.cleanupService.cleanupOldRoutingDispatches();
        return event.id;
    }

    async releaseClaim(eventId: string): Promise<void> {
        await this.cleanupService.releaseWebhookEventClaim(eventId);
    }

    private async verifyEvent(payload: string, signature: string): Promise<Stripe.Event> {
        const webhookSecret = this.env.STRIPE_WEBHOOK_SECRET?.trim();
        console.log(`[Webhook Debug] Secret starts with: ${webhookSecret?.substring(0, 10)}...`);
        console.log(`[Webhook Debug] Secret length: ${webhookSecret?.length}`);
        console.log(`[Webhook Debug] Signature header: ${signature?.substring(0, 30)}...`);
        console.log(`[Webhook Debug] Body length: ${payload?.length}`);

        if (!webhookSecret || !webhookSecret.startsWith('whsec_')) {
            console.error(`[Webhook Debug] Invalid webhook secret format. Value starts with: "${webhookSecret?.substring(0, 10)}"`);
            throw new WebhookHttpError(500, 'Webhook secret misconfigured');
        }

        try {
            return await createPaymentService(this.env).verifyWebhookEvent(
                payload,
                signature,
                webhookSecret
            ) as Stripe.Event;
        } catch (err) {
            const error = err as Error;
            console.error('Webhook signature verification failed.');
            console.error(`  Error name: ${error.name}`);
            console.error(`  Error message: ${error.message}`);
            console.error(`  Full error: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
            throw new WebhookHttpError(400, 'Webhook signature verification failed');
        }
    }
}
