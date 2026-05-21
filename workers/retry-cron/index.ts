import { Env, Address } from '../../src/lib/types';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';

interface PendingDispatch {
    id: string;
    customer_id: string;
    subscription_id: string;
    service_date: string;
    retry_count: number;
}

export default {
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleRetries(env));
    },

    async handleRetries(env: Env) {
        console.log('Starting Retry Dispatch Cron...');

        // 1. Fetch pending dispatches (max 5 retries)
        const { results } = await env.DB.prepare(
            `SELECT p.*, a.raw_address, a.latitude, a.longitude
             FROM pending_dispatches p
             JOIN customers c ON p.customer_id = c.id
             JOIN addresses a ON c.address_id = a.id
             WHERE p.retry_count < 5`
        ).all<PendingDispatch & Address>();

        if (!results || results.length === 0) {
            console.log('No pending dispatches found.');
            return;
        }

        console.log(`Found ${results.length} pending dispatches. Retrying...`);

        // 3. Fetch Holiday Offset
        const offsetRow = await env.DB.prepare("SELECT value FROM global_settings WHERE key = 'holiday_offset_hours'").first<{ value: string }>();
        const offsetHours = parseInt(offsetRow?.value || '0', 10);

        // 2. Group by service_date to create batch jobs if possible,
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

                // 3. If successful, remove from pending and log as pending in service history
                await env.DB.batch([
                    env.DB.prepare('DELETE FROM pending_dispatches WHERE id = ?').bind(row.id),
                    env.DB.prepare(
                        'INSERT INTO service_history (id, customer_id, subscription_id, service_date, dispatch_status) VALUES (?, ?, ?, ?, ?)'
                    ).bind(crypto.randomUUID(), row.customer_id, row.subscription_id, row.service_date, 'Pending')
                ]);
                console.log(`Successfully retried and removed dispatch ${row.id}, logged Pending service history.`);
            } catch (error: any) {
                console.error(`Retry failed for ${row.id}:`, error);
                // 4. Increment retry count
                await env.DB.prepare(
                    'UPDATE pending_dispatches SET retry_count = retry_count + 1, last_error = ? WHERE id = ?'
                )
                .bind(error.message || 'Retry failed', row.id)
                .run();
            }
        }
    }
};
