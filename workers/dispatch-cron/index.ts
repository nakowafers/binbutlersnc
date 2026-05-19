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

        // 1. Fetch due subscriptions
        // Logic: active, not paused, current_period_end in future, and (last_service_date is null OR now - last_service_date >= frequency_days)
        const now = new Date();
        const nowIso = now.toISOString();

        const query = `
            SELECT
                s.*,
                a.raw_address,
                a.latitude,
                a.longitude,
                c.email
            FROM subscriptions s
            JOIN customers c ON s.customer_id = c.id
            JOIN addresses a ON c.id = a.customer_id
            WHERE (
              (s.status = 'active' AND s.is_paused = FALSE AND s.current_period_end > ?)
              OR
              (s.status = 'one-time' AND s.last_service_date IS NULL)
            )
            AND (
              s.last_service_date IS NULL
              OR (julianday(?) - julianday(s.last_service_date)) >= s.frequency_days
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

        // 3. Fetch Holiday Offset
        const offsetRow = await env.DB.prepare("SELECT value FROM global_settings WHERE key = 'holiday_offset_hours'").first<{ value: string }>();
        const offsetHours = parseInt(offsetRow?.value || '0', 10);

        const serviceDate = new Date(now);
        serviceDate.setHours(serviceDate.getHours() + offsetHours);
        const formattedDate = serviceDate.toISOString().split('T')[0];

        // 2. Prepare Routing Job
        const routingService = new RoutificAdapter(env.ROUTIFIC_API_KEY, env.ROUTIFIC_WORKSPACE_ID);
        const stops = results.map(row => ({
            id: crypto.randomUUID(),
            address: row.raw_address,
            lat: row.latitude || undefined,
            lng: row.longitude || undefined,
            customer_id: row.customer_id,
            subscription_id: row.id
        }));

        try {
            const jobId = await routingService.createJob({
                id: crypto.randomUUID(),
                stops: stops,
                date: formattedDate
            });
            console.log(`Successfully created routing job: ${jobId}`);
        } catch (error: any) {
            console.error('Failed to create routing job:', error);

            // 4. Log to pending_dispatches for retry
            const batch = stops.map(stop =>
                env.DB.prepare(
                    'INSERT INTO pending_dispatches (id, customer_id, subscription_id, service_date, last_error) VALUES (?, ?, ?, ?, ?)'
                ).bind(
                    crypto.randomUUID(),
                    stop.customer_id,
                    stop.subscription_id,
                    nowIso,
                    error.message || 'Unknown Error'
                )
            );
            await env.DB.batch(batch);
            console.log(`Logged ${stops.length} stops to pending_dispatches for retry.`);
        }
    }
};
