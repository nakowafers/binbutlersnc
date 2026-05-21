import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { Env } from '@/lib/types';

export const runtime = 'edge';

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
    if (!signature || !secret) return false;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
    );
    
    // Convert hex signature to Uint8Array safely
    const match = signature.match(/.{1,2}/g);
    if (!match) return false;
    const sigArray = new Uint8Array(match.map(byte => parseInt(byte, 16)));
    
    const verified = await crypto.subtle.verify(
        'HMAC',
        key,
        sigArray,
        encoder.encode(payload)
    );
    
    return verified;
}

export async function POST(request: Request) {
    try {
        const { env } = (getRequestContext() as unknown) as { env: Env };
        
        const payloadStr = await request.text();
        const signature = request.headers.get('x-routific-signature') || '';
        
        // Use a configured secret if available. If not, log a warning for security.
        // In production, this should be mandatory.
        const secret = (env as Env & { ROUTIFIC_WEBHOOK_SECRET?: string }).ROUTIFIC_WEBHOOK_SECRET;
        if (secret) {
            if (!(await verifySignature(payloadStr, signature, secret))) {
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
        } else {
            console.warn('ROUTIFIC_WEBHOOK_SECRET is not set. Skipping signature verification.');
        }

        interface RoutificEvent {
            event: string;
            data: {
                id: string;
                customer_id: string;
                subscription_id: string;
                completed_at?: string;
            }
        }
        const body = JSON.parse(payloadStr) as RoutificEvent;

        if (body.event === 'stop.completed') {
            const { data } = body;
            const now = new Date().toISOString();

            // Webhook does an UPDATE instead of INSERT because dispatch-cron already creates a Pending row
            await env.DB.batch([
                // 1. Log completion in service_history by updating the pending record
                env.DB.prepare(
                    `UPDATE service_history 
                     SET dispatch_status = ?, service_date = COALESCE(?, service_date) 
                     WHERE subscription_id = ? AND dispatch_status = 'Pending'`
                ).bind(
                    'Completed',
                    data.completed_at || null,
                    data.subscription_id
                ),

                // 2. Update subscription last_service_date
                env.DB.prepare(
                    'UPDATE subscriptions SET last_service_date = ? WHERE id = ?'
                ).bind(data.completed_at || now, data.subscription_id)
            ]);

            console.log(`Logged service completion for subscription ${data.subscription_id}`);
        } else if (body.event === 'stop.skipped') {
            const { data } = body;

            // Log as Skipped/Failed in service_history but DO NOT update last_service_date on the subscription
            // so they automatically reschedule for the following week
            await env.DB.prepare(
                `UPDATE service_history 
                 SET dispatch_status = ?, service_date = COALESCE(?, service_date) 
                 WHERE subscription_id = ? AND dispatch_status = 'Pending'`
            ).bind(
                'Skipped',
                data.completed_at || null,
                data.subscription_id
            ).run();

            console.log(`Logged service skip/failure for subscription ${data.subscription_id}`);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Routific webhook error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
