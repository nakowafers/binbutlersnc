import { getRequestContext } from '@cloudflare/next-on-pages';
import { Env } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';

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
        
        const secret = (env as Env & { ROUTIFIC_WEBHOOK_SECRET?: string }).ROUTIFIC_WEBHOOK_SECRET;
        if (!secret) {
            console.error('ROUTIFIC_WEBHOOK_SECRET is not configured.');
            return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), { 
                status: 500, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
        if (!(await verifySignature(payloadStr, signature, secret))) {
            return new Response(JSON.stringify({ error: 'Invalid signature' }), { 
                status: 401, 
                headers: { 'Content-Type': 'application/json' } 
            });
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

        const db = new D1DatabaseAdapter(env.DB);

        if (body.event === 'stop.completed') {
            const { data } = body;

            // Webhook does an UPDATE instead of INSERT because dispatch-cron already creates a Pending row
            await db.updateServiceHistoryOnCompletion(data.subscription_id, data.completed_at || null);

            console.log(`Logged service completion for subscription ${data.subscription_id}`);
        } else if (body.event === 'stop.skipped') {
            const { data } = body;

            // Log as Skipped/Failed in service_history so they automatically reschedule for the following week
            await db.updateServiceHistoryOnSkipped(data.subscription_id, data.completed_at || null);

            console.log(`Logged service skip/failure for subscription ${data.subscription_id}`);
        }

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
