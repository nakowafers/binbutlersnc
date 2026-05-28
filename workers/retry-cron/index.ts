import { Env } from '../../src/lib/types';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';
import { D1DatabaseAdapter } from '../../src/lib/db/D1DatabaseAdapter';

export default {
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleRetries(env));
    },

    async handleRetries(env: Env) {
        console.log('Starting Retry Dispatch Cron...');

        const db = new D1DatabaseAdapter(env.DB);

        // 1. Fetch pending dispatches (max 5 retries)
        const results = await db.getPendingDispatches(5);

        if (!results || results.length === 0) {
            console.log('No pending dispatches found.');
            return;
        }

        console.log(`Found ${results.length} pending dispatches. Retrying...`);

        // 3. Fetch Holiday Offset
        const offsetRowVal = await db.getGlobalSetting('holiday_offset_hours');
        const offsetHours = parseInt(offsetRowVal || '0', 10);

        // 2. Group by service_date to create batch jobs if possible
        const routingService = new RoutificAdapter(env.ROUTIFIC_API_KEY, env.ROUTIFIC_WORKSPACE_ID);

        for (const row of results) {
            try {
                const serviceDate = new Date(row.service_date);
                serviceDate.setHours(serviceDate.getHours() + offsetHours);
                const formattedDate = serviceDate.toISOString().split('T')[0];

                await routingService.createJob({
                    id: crypto.randomUUID(),
                    stops: [{
                        id: crypto.randomUUID(),
                        address: row.raw_address,
                        lat: row.latitude || undefined,
                        lng: row.longitude || undefined,
                        customer_id: row.customer_id,
                        subscription_id: row.subscription_id
                    }],
                    date: formattedDate
                });

                // 3. If successful, remove from pending and log as pending in service history via Adapter
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
