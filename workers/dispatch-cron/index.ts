import { Env } from '../../src/lib/types';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';
import { D1DatabaseAdapter } from '../../src/lib/db/D1DatabaseAdapter';

const dispatchCron = {
    async fetch() {
        return new Response("Dispatch Cron Worker is running. Press 's' in the terminal to trigger the scheduled event.");
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleDispatch(env, event.scheduledTime));
    },

    async handleDispatch(env: Env, scheduledTime?: number) {
        console.log('Starting Weekly Dispatch Cron...');

        // Atomic lock acquisition: INSERT ... ON CONFLICT with WHERE only updates expired locks
        const acquiredAt = Date.now();
        const lockKey = 'cron_lock_dispatch';
        const ttl = 30 * 60 * 1000;
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

        // Use scheduledTime to avoid drift from delayed cron execution
        const anchorMs = scheduledTime ?? Date.now();
        const now = new Date(anchorMs);
        const nowIso = now.toISOString();

        const db = new D1DatabaseAdapter(env.DB);
        const results = await db.getDueSubscriptions(nowIso);

        if (!results || results.length === 0) {
            console.log('No due subscriptions found.');
            return;
        }

        console.log(`Found ${results.length} due subscriptions. Pushing to Routific...`);

        const offsetRowVal = await db.getGlobalSetting('holiday_offset_hours');
        const offsetHours = parseInt(offsetRowVal || '0', 10);

        const routingService = new RoutificAdapter(env.ROUTIFIC_API_KEY, env.ROUTIFIC_WORKSPACE_ID);

        // Group by service_day
        const daysMap = { 'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6 };
        const jobsByDate: Record<string, Array<{
            id: string;
            address: string;
            lat?: number;
            lng?: number;
            customer_id: string;
            subscription_id: string;
        }>> = {};

        for (const row of results) {
            const isStillPaused = await env.DB.prepare(
                'SELECT is_paused FROM subscriptions WHERE id = ?'
            ).bind(row.id).first<{ is_paused: boolean }>();
            if (isStillPaused?.is_paused) {
                console.log(`Skipping ${row.id}: subscription paused during processing.`);
                continue;
            }

            const sDay = (row.service_day || 'MON').toUpperCase();
            const target = daysMap[sDay as keyof typeof daysMap] ?? 1;
            const today = now.getDay();
            let daysUntil = target - today;
            if (daysUntil <= 0) daysUntil += 7;
            
            const serviceDate = new Date(now);
            serviceDate.setDate(serviceDate.getDate() + daysUntil);
            serviceDate.setHours(serviceDate.getHours() + offsetHours);
            const formattedDate = serviceDate.toISOString().split('T')[0];

            if (!jobsByDate[formattedDate]) jobsByDate[formattedDate] = [];
            jobsByDate[formattedDate].push({
                id: crypto.randomUUID(),
                address: row.raw_address,
                lat: row.latitude || undefined,
                lng: row.longitude || undefined,
                customer_id: row.customer_id,
                subscription_id: row.id
            });
        }

        const historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string }> = [];
        const retryInserts: Array<{ id: string; subscriptionId: string; date: string; errorMsg: string }> = [];
        const routificDispatches: Array<{ id: string; subscriptionId: string; routificOrderId: string; serviceDate: string }> = [];

        for (const [date, stops] of Object.entries(jobsByDate)) {
            try {
                const jobId = await routingService.createJob({
                    id: crypto.randomUUID(),
                    stops: stops,
                    date: date
                });
                console.log(`Successfully created routing job: ${jobId} for date: ${date}`);
                
                // Add to service history as 'Pending' and collect routific order IDs for batched insert
                for (const stop of stops) {
                    const historyId = crypto.randomUUID();
                    historyInserts.push({
                        id: historyId,
                        subscriptionId: stop.subscription_id,
                        date,
                        status: 'Pending'
                    });
                    routificDispatches.push({
                        id: crypto.randomUUID(),
                        subscriptionId: stop.subscription_id,
                        routificOrderId: stop.id,
                        serviceDate: date
                    });
                }
            } catch (error: unknown) {
                console.error(`Failed to create routing job for ${date}:`, error);
                
                for (const stop of stops) {
                    retryInserts.push({
                        id: crypto.randomUUID(),
                        subscriptionId: stop.subscription_id,
                        date,
                        errorMsg: error instanceof Error ? error.message : 'Unknown Error'
                    });
                }
            }
        }

        // Execute batch DB operations via Adapter (includes routific dispatch tracking)
        try {
            await db.logDispatchedJobs(historyInserts, retryInserts, routificDispatches);
            console.log(`Logged ${historyInserts.length} to service_history, ${retryInserts.length} to pending_dispatches.`);
        } catch (batchError) {
            console.error('Failed to persist dispatch results:', batchError);
        }
    }
};

export default dispatchCron;
