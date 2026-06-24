import { Env } from '../../src/lib/types';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';
import { D1DatabaseAdapter } from '../../src/lib/db/D1DatabaseAdapter';
import { DispatchCoordinator } from '../../src/lib/dispatch/DispatchCoordinator';

const dailyDispatchCron = {
    async fetch() {
        return new Response("Daily Dispatch Cron Worker is running. Press 's' in the terminal to trigger the scheduled event.");
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleDispatch(env, event.scheduledTime));
    },

    async handleDispatch(env: Env, scheduledTime?: number) {
        console.log('Starting Daily Dispatch Cron...');
        const db = new D1DatabaseAdapter(env.DB);
        const routing = new RoutificAdapter(env.ROUTIFIC_API_KEY, env.ROUTIFIC_WORKSPACE_ID);
        const coordinator = new DispatchCoordinator(db, db, db, routing);

        const anchorMs = scheduledTime ?? Date.now();
        await coordinator.dispatchDueStops(new Date(anchorMs));
    }
};

export default dailyDispatchCron;
