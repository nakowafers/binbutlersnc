import { Env, Subscription, Address } from '../../src/lib/types';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';

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

        const query = `
            SELECT
                s.*,
                a.raw_address,
                a.latitude,
                a.longitude,
                a.service_day,
                c.email
            FROM subscriptions s
            JOIN customers c ON s.customer_id = c.id
            JOIN addresses a ON c.address_id = a.id
            WHERE (
              (s.status IN ('active', 'cancelled') AND s.is_paused = FALSE AND s.current_period_end > ?)
              OR
              (s.status = 'one-time' AND s.last_service_date IS NULL)
            )
            AND (
              s.last_service_date IS NULL
              OR (julianday(?) - julianday(s.last_service_date)) >= s.frequency_days
            )
            AND NOT EXISTS (
              SELECT 1 FROM service_history sh 
              WHERE sh.subscription_id = s.id 
              AND sh.dispatch_status = 'Pending'
            )
        `;

        const { results } = await env.DB.prepare(query)
            .bind(nowIso, nowIso)
            .all<Subscription & Address & { email: string }>();

        if (!results || results.length === 0) {
            console.log('No due subscriptions found.');
            return;
        }

        console.log(`Found ${results.length} due subscriptions. Pushing to Routific...`);

        const offsetRow = await env.DB.prepare("SELECT value FROM global_settings WHERE key = 'holiday_offset_hours'").first<{ value: string }>();
        const offsetHours = parseInt(offsetRow?.value || '0', 10);

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

        const pendingHistoryBatch = [];
        const pendingRetryBatch = [];

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
                    pendingHistoryBatch.push(
                        env.DB.prepare(
                            'INSERT INTO service_history (id, customer_id, subscription_id, service_date, dispatch_status) VALUES (?, ?, ?, ?, ?)'
                        ).bind(crypto.randomUUID(), stop.customer_id, stop.subscription_id, date, 'Pending')
                    );
                }
            } catch (error: any) {
                console.error(`Failed to create routing job for ${date}:`, error);
                
                for (const stop of stops) {
                    pendingRetryBatch.push(
                        env.DB.prepare(
                            'INSERT INTO pending_dispatches (id, customer_id, subscription_id, service_date, last_error) VALUES (?, ?, ?, ?, ?)'
                        ).bind(crypto.randomUUID(), stop.customer_id, stop.subscription_id, date, error.message || 'Unknown Error')
                    );
                }
            }
        }

        // Execute batch DB operations
        const allBatches = [...pendingHistoryBatch, ...pendingRetryBatch];
        if (allBatches.length > 0) {
            // D1 limits batch size to 100
            for (let i = 0; i < allBatches.length; i += 100) {
                await env.DB.batch(allBatches.slice(i, i + 100));
            }
        }
        
        console.log(`Logged ${pendingHistoryBatch.length} to service_history, ${pendingRetryBatch.length} to pending_dispatches.`);
    }
};
