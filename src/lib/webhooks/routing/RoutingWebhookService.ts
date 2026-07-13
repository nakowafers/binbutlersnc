import { IServiceHistoryRepository } from '@/lib/db/types';

export interface RoutingWebhookEvent {
    event: string;
    data: {
        id: string;
        customer_id: string;
        subscription_id: string;
        completed_at?: string;
    };
}

export class RoutingWebhookService {
    constructor(private readonly serviceHistoryRepo: IServiceHistoryRepository) {}

    async verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
        if (!signature || !secret) return false;

        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        const match = signature.match(/.{1,2}/g);
        if (!match) return false;
        const sigArray = new Uint8Array(match.map(byte => parseInt(byte, 16)));

        return await crypto.subtle.verify(
            'HMAC',
            key,
            sigArray,
            encoder.encode(payload)
        );
    }

    async handleEvent(body: RoutingWebhookEvent): Promise<void> {
        if (body.event === 'stop.completed') {
            const { data } = body;
            await this.serviceHistoryRepo.updateServiceHistoryOnCompletion(data.subscription_id, data.completed_at || null);
            console.log(`Logged service completion for subscription ${data.subscription_id}`);
            return;
        }

        if (body.event === 'stop.skipped') {
            const { data } = body;
            await this.serviceHistoryRepo.updateServiceHistoryOnSkipped(data.subscription_id, data.completed_at || null);
            console.log(`Logged service skip/failure for subscription ${data.subscription_id}`);
        }
    }
}
