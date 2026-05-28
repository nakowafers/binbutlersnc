import { Env } from '../../src/lib/types';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';
import { D1DatabaseAdapter } from '../../src/lib/db/D1DatabaseAdapter';

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        return new Response("Dispatch Cron Worker is running. Press 's' in the terminal to trigger the scheduled event.");
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleDispatch(env));
    },

    async handleDispatch(env: Env) {
        console.log('Starting Weekly Dispatch Cron...');

        const now = new Date();
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
        const jobsByDate: Record<string, any[]> = {};

        for (const row of results) {
            const sDay = (row.service_day || 'MON').toUpperCase();
            const target = (daysMap as any)[sDay] ?? 1;
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

        const historyInserts: Array<{ id: string; customerId: string; subscriptionId: string; date: string; status: string }> = [];
        const retryInserts: Array<{ id: string; customerId: string; subscriptionId: string; date: string; errorMsg: string }> = [];

        for (const [date, stops] of Object.entries(jobsByDate)) {
            try {
                const jobId = await routingService.createJob({
                    id: crypto.randomUUID(),
                    stops: stops,
                    date: date
                });
                console.log(`Successfully created routing job: ${jobId} for date: ${date}`);
                
                // Add to service history as 'Pending'
                for (const stop of stops) {
                    historyInserts.push({
                        id: crypto.randomUUID(),
                        customerId: stop.customer_id,
                        subscriptionId: stop.subscription_id,
                        date,
                        status: 'Pending'
                    });
                }
            } catch (error: any) {
                console.error(`Failed to create routing job for ${date}:`, error);
                
                for (const stop of stops) {
                    retryInserts.push({
                        id: crypto.randomUUID(),
                        customerId: stop.customer_id,
                        subscriptionId: stop.subscription_id,
                        date,
                        errorMsg: error.message || 'Unknown Error'
                    });
                }
            }
        }

        // Execute batch DB operations via Adapter
        await db.logDispatchedJobs(historyInserts, retryInserts);
        
        console.log(`Logged ${historyInserts.length} to service_history, ${retryInserts.length} to pending_dispatches.`);
    }
};
