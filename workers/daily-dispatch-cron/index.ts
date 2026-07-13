import { Env } from '../../src/lib/types';
import { createDispatchCoordinator } from '../../src/lib/backend/createServices';

const dailyDispatchCron = {
    async fetch() {
        return new Response("Daily Dispatch Cron Worker is running. Press 's' in the terminal to trigger the scheduled event.");
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleDispatch(env, event.scheduledTime));
    },

    async handleDispatch(env: Env, scheduledTime?: number) {
        console.log('Starting Daily Dispatch Cron...');
        const anchorMs = scheduledTime ?? Date.now();
        await createDispatchCoordinator(env).dispatchDueStops(new Date(anchorMs));
    }
};

export default dailyDispatchCron;
