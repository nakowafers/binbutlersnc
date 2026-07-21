import { Env } from '@/lib/types';

export class WebhookCleanupService {
    constructor(private readonly env: Env) {}

    async cleanupProcessedEvents(): Promise<void> {
        try {
            await this.env.DB.prepare(
                'DELETE FROM webhook_events WHERE created_at < unixepoch() - 2592000'
            ).run();
        } catch (cleanupError) {
            console.error('Webhook events cleanup failed:', cleanupError);
        }
    }

    async cleanupOldDispatchStops(): Promise<void> {
        try {
            await this.env.DB.prepare(
                "DELETE FROM dispatch_stops WHERE service_date < ? AND dispatch_status IN ('completed', 'skipped')"
            ).bind(new Date().toISOString().split('T')[0]).run();
        } catch (cleanupError) {
            console.error('Dispatch stop cleanup failed:', cleanupError);
        }
    }

    async releaseWebhookEventClaim(eventId: string): Promise<void> {
        try {
            await this.env.DB.prepare('DELETE FROM webhook_events WHERE id = ?').bind(eventId).run();
        } catch (cleanupError) {
            console.error('Failed to release webhook event claim:', cleanupError);
        }
    }
}
