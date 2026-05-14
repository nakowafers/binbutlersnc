import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { Env } from '@/lib/types';

export const runtime = 'edge';

export async function POST(request: Request) {
    try {
        const { env } = (getRequestContext() as unknown) as { env: Env };
        interface RoutificEvent {
            event: string;
            data: {
                id: string;
                customer_id: string;
                subscription_id: string;
                completed_at?: string;
                photo_url?: string;
            }
        }
        const body = await request.json() as RoutificEvent;

        // Routific sends webhooks when a stop is completed
        // Expected payload structure (simplified):
        // {
        //   "event": "stop.completed",
        //   "data": {
        //     "id": "stop_id",
        //     "customer_id": "...",
        //     "subscription_id": "...",
        //     "completed_at": "...",
        //     "photo_url": "..."
        //   }
        // }

        if (body.event === 'stop.completed') {
            const { data } = body;
            const serviceHistoryId = crypto.randomUUID();
            const now = new Date().toISOString();

            await env.DB.batch([
                // 1. Log completion in service_history
                env.DB.prepare(
                    'INSERT INTO service_history (id, customer_id, subscription_id, service_date, dispatch_status, photo_url) VALUES (?, ?, ?, ?, ?, ?)'
                ).bind(
                    serviceHistoryId,
                    data.customer_id,
                    data.subscription_id,
                    data.completed_at || now,
                    'Completed',
                    data.photo_url || null
                ),

                // 2. Update subscription last_service_date
                env.DB.prepare(
                    'UPDATE subscriptions SET last_service_date = ? WHERE id = ?'
                ).bind(data.completed_at || now, data.subscription_id)
            ]);

            console.log(`Loggged service completion for subscription ${data.subscription_id}`);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Routific webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
