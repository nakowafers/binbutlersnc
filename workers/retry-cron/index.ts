import { Env } from '../../src/lib/types';
import { RoutificAdapter } from '../../src/lib/routing/RoutificAdapter';
import { D1DatabaseAdapter } from '../../src/lib/db/D1DatabaseAdapter';
import { DispatchCoordinator } from '../../src/lib/dispatch/DispatchCoordinator';

const retryCron = {
    async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleRetries(env));
    },

    async handleRetries(env: Env) {
        console.log('Starting Retry Dispatch Cron...');
        const db = new D1DatabaseAdapter(env.DB);
        const routing = new RoutificAdapter(env.ROUTIFIC_API_KEY, env.ROUTIFIC_WORKSPACE_ID);
        const coordinator = new DispatchCoordinator(db, db, db, routing);

        await coordinator.retryFailedDispatches(5);
    }
};

export default retryCron;
