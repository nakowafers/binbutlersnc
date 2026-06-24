import { ISubscriptionRepository, IServiceHistoryRepository, ISettingsRepository, DueSubscriptionResult } from '../db/types';
import { IRoutingService } from '../routing/types';
import { DispatchPlanner, PlannedDispatchCandidate } from './DispatchPlanner';

function toRoutingStop(candidate: PlannedDispatchCandidate) {
    return {
        id: crypto.randomUUID(),
        address: candidate.address,
        lat: candidate.lat,
        lng: candidate.lng,
        customer_id: candidate.customer_id,
        subscription_id: candidate.subscription_id,
        bin_quantity: candidate.bin_quantity,
    };
}

export class DispatchExecutionAdapter {
    constructor(
        private readonly subscriptionRepo: ISubscriptionRepository,
        private readonly serviceHistoryRepo: IServiceHistoryRepository,
        private readonly settingsRepo: ISettingsRepository,
        private readonly routingService: IRoutingService,
        private readonly planner: DispatchPlanner = new DispatchPlanner()
    ) {}

    async dispatchDueStops(anchorDate: Date): Promise<void> {
        const acquiredAt = Date.now();
        const lockKey = 'cron_lock_dispatch';
        const ttl = 30 * 60 * 1000;
        const lockValue = JSON.stringify({ acquired_at: acquiredAt });

        const locked = await this.settingsRepo.acquireLock(lockKey, lockValue, acquiredAt - ttl);
        if (!locked) {
            console.log('Another worker holds the dispatch cron lock, skipping this run.');
            return;
        }

        try {
            await this.processDispatch(anchorDate);
        } catch (error) {
            console.error('Error during dispatch execution:', error);
            throw error;
        }
    }

    async retryFailedDispatches(maxRetries: number = 5): Promise<void> {
        const acquiredAt = Date.now();
        const lockKey = 'cron_lock_retry';
        const ttl = 5 * 60 * 1000;
        const lockValue = JSON.stringify({ acquired_at: acquiredAt });

        const locked = await this.settingsRepo.acquireLock(lockKey, lockValue, acquiredAt - ttl);
        if (!locked) {
            console.log('Another worker holds the retry cron lock, skipping this run.');
            return;
        }

        try {
            await this.processRetries(maxRetries);
        } catch (error) {
            console.error('Error during retry execution:', error);
            throw error;
        }
    }

    private async processDispatch(now: Date): Promise<void> {
        const nowIso = now.toISOString();
        const results = await this.subscriptionRepo.getDueSubscriptions(nowIso);

        if (!results || results.length === 0) {
            console.log('No due subscriptions found.');
            return;
        }

        console.log(`Found ${results.length} due subscriptions. Checking for tomorrow's stops...`);

        const offsetRowVal = await this.settingsRepo.getGlobalSetting('holiday_offset_hours');
        const offsetHours = parseInt(offsetRowVal || '0', 10);
        const plan = this.planner.planDueDispatches(now, results as DueSubscriptionResult[], offsetHours);

        if (plan.stops.length === 0) {
            console.log('No due subscriptions scheduled for tomorrow.');
            return;
        }

        console.log(`Found ${plan.stops.length} stops for tomorrow (${plan.date}). Pushing to Routing Provider...`);

        const jobStops = plan.stops.map(toRoutingStop);
        const historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string; binQuantity?: number }> = [];
        const retryInserts: Array<{ id: string; subscriptionId: string; date: string; errorMsg: string }> = [];
        const routificDispatches: Array<{ id: string; subscriptionId: string; routificOrderId: string; serviceDate: string }> = [];

        try {
            const jobId = await this.routingService.createJob({
                id: crypto.randomUUID(),
                stops: jobStops,
                date: plan.date
            });
            console.log(`Successfully created routing job: ${jobId} for date: ${plan.date}`);

            for (const stop of jobStops) {
                const historyId = crypto.randomUUID();
                historyInserts.push({
                    id: historyId,
                    subscriptionId: stop.subscription_id,
                    date: plan.date,
                    status: 'Pending',
                    binQuantity: stop.bin_quantity,
                });
                routificDispatches.push({
                    id: crypto.randomUUID(),
                    subscriptionId: stop.subscription_id,
                    routificOrderId: stop.id,
                    serviceDate: plan.date
                });
            }
        } catch (error: unknown) {
            console.error(`Failed to create routing job for ${plan.date}:`, error);

            for (const stop of jobStops) {
                retryInserts.push({
                    id: crypto.randomUUID(),
                    subscriptionId: stop.subscription_id,
                    date: plan.date,
                    errorMsg: error instanceof Error ? error.message : 'Unknown Error'
                });
            }
        }

        try {
            await this.serviceHistoryRepo.logDispatchedJobs(historyInserts, retryInserts, routificDispatches);
            console.log(`Logged ${historyInserts.length} to service_history, ${retryInserts.length} to pending_dispatches.`);
        } catch (batchError) {
            console.error('Failed to persist dispatch results:', batchError);
        }
    }

    private async processRetries(maxRetries: number): Promise<void> {
        const results = await this.serviceHistoryRepo.getPendingDispatches(maxRetries);

        if (!results || results.length === 0) {
            console.log('No pending dispatches found.');
            return;
        }

        console.log(`Found ${results.length} pending dispatches. Retrying...`);

        for (const row of results) {
            try {
                const plan = this.planner.planRetryDispatch(row);
                const routingStop = toRoutingStop(plan.stops[0]);

                await this.routingService.createJob({
                    id: crypto.randomUUID(),
                    stops: [routingStop],
                    date: plan.date
                });

                await this.serviceHistoryRepo.deletePendingDispatchAndLogSuccess(
                    row.id,
                    crypto.randomUUID(),
                    row.subscription_id,
                    row.service_date,
                    crypto.randomUUID(),
                    routingStop.id
                );
                console.log(`Successfully retried and removed dispatch ${row.id}, logged Pending service history.`);
            } catch (error: unknown) {
                console.error(`Retry failed for ${row.id}:`, error);
                await this.serviceHistoryRepo.incrementPendingDispatchRetryCount(
                    row.id,
                    error instanceof Error ? error.message : 'Retry failed'
                );
            }
        }
    }
}
