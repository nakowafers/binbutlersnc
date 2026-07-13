import { Env } from '../../src/lib/types';
import { createDispatchCoordinator } from '../../src/lib/backend/createServices';

const retryCron = {
    async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        ctx.waitUntil(this.handleRetries(env));
    },

    async handleRetries(env: Env) {
        console.log('Starting Retry Dispatch Cron...');
        await createDispatchCoordinator(env).retryFailedDispatches(5);
    }
};

export default retryCron;
