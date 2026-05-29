import { Env } from '../../src/lib/types';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';
import { D1DatabaseAdapter } from '../../src/lib/db/D1DatabaseAdapter';

export default {
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleRetries(env));
    },

    async handleRetries(env: Env) {
        console.log('Starting Retry Dispatch Cron...');

        const lockKey = 'cron_lock_retry';
        const existingLock = await env.DB.prepare(
            "SELECT value FROM global_settings WHERE key = ?"
        ).bind(lockKey).first<{ value: string }>();

        if (existingLock) {
            const parsed = JSON.parse(existingLock.value);
            const now = Date.now();
            if (now - parsed.acquired_at < 30 * 60 * 1000) {
                console.log('Retry cron lock still held, skipping this run.');
                return;
            }
        }
        await env.DB.prepare(
            'INSERT INTO global_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP'
        ).bind(lockKey, JSON.stringify({ acquired_at: Date.now() })).run();

        const db = new D1DatabaseAdapter(env.DB);

        // 1. Fetch pending dispatches (max 5 retries)
        const results = await db.getPendingDispatches(5);

        if (!results || results.length === 0) {
            console.log('No pending dispatches found.');
            return;
        }

        console.log(`Found ${results.length} pending dispatches. Retrying...`);

        const routingService = new RoutificAdapter(env.ROUTIFIC_API_KEY, env.ROUTIFIC_WORKSPACE_ID);

        for (const row of results) {
            try {
                const formattedDate = row.service_date.split('T')[0];
                const routificOrderId = crypto.randomUUID();

                await routingService.createJob({
                    id: crypto.randomUUID(),
                    stops: [{
                        id: routificOrderId,
                        address: row.raw_address,
                        lat: row.latitude || undefined,
                        lng: row.longitude || undefined,
                        customer_id: row.customer_id,
                        subscription_id: row.subscription_id
                    }],
                    date: formattedDate
                });

                // 3. Store Routific order ID and log success
                await db.storeRoutificDispatch(
                    crypto.randomUUID(),
                    row.subscription_id,
                    routificOrderId,
                    row.service_date
                );
                await db.deletePendingDispatchAndLogSuccess(
                    row.id,
                    crypto.randomUUID(),
                    row.customer_id,
                    row.subscription_id,
                    row.service_date
                );
                console.log(`Successfully retried and removed dispatch ${row.id}, logged Pending service history.`);
            } catch (error: any) {
                console.error(`Retry failed for ${row.id}:`, error);
                // 4. Increment retry count via Adapter
                await db.incrementPendingDispatchRetryCount(row.id, error.message || 'Retry failed');
            }
        }
    }
};
