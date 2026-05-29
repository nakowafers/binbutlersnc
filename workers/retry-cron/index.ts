import { Env } from '../../src/lib/types';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';
import { D1DatabaseAdapter } from '../../src/lib/db/D1DatabaseAdapter';

const retryCron = {
    async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleRetries(env));
    },

    async handleRetries(env: Env) {
        console.log('Starting Retry Dispatch Cron...');

        // Atomic lock acquisition
        const acquiredAt = Date.now();
        const lockKey = 'cron_lock_retry';
        const ttl = 5 * 60 * 1000;
        const lockValue = JSON.stringify({ acquired_at: acquiredAt });

        await env.DB.prepare(
            `INSERT INTO global_settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value = EXCLUDED.value,
               updated_at = CURRENT_TIMESTAMP
             WHERE json_extract(value, '$.acquired_at') < ?`
        ).bind(lockKey, lockValue, acquiredAt - ttl).run();

        const lockRow = await env.DB.prepare(
            'SELECT value FROM global_settings WHERE key = ?'
        ).bind(lockKey).first<{ value: string }>();

        if (!lockRow || JSON.parse(lockRow.value).acquired_at !== acquiredAt) {
            console.log('Another worker holds the cron lock, skipping this run.');
            return;
        }

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

                await db.deletePendingDispatchAndLogSuccess(
                    row.id,
                    crypto.randomUUID(),
                    row.customer_id,
                    row.subscription_id,
                    row.service_date,
                    crypto.randomUUID(),
                    routificOrderId
                );
                console.log(`Successfully retried and removed dispatch ${row.id}, logged Pending service history.`);
            } catch (error: unknown) {
                console.error(`Retry failed for ${row.id}:`, error);
                // 4. Increment retry count via Adapter
                await db.incrementPendingDispatchRetryCount(
                    row.id,
                    error instanceof Error ? error.message : 'Retry failed'
                );
            }
        }
    }
};

export default retryCron;
