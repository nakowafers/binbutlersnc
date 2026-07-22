import { ISubscriptionRepository, IServiceHistoryRepository, ISettingsRepository, DueSubscriptionResult, IDispatchStopRepository, CreateDispatchStopInput } from '../db/types';
import { GeoapifyGeocoder } from '../geocoding/GeoapifyGeocoder';
import { DispatchPlanner, PlannedDispatchCandidate } from './DispatchPlanner';
import { RouteOptimizer } from './RouteOptimizer';

export class DispatchExecutionAdapter {
    constructor(
        private readonly subscriptionRepo: ISubscriptionRepository,
        private readonly serviceHistoryRepo: IServiceHistoryRepository,
        private readonly settingsRepo: ISettingsRepository,
        private readonly dispatchStopRepo: IDispatchStopRepository,
        private readonly planner: DispatchPlanner = new DispatchPlanner(),
        private readonly optimizer: RouteOptimizer = new RouteOptimizer(),
        private readonly geocoder: GeoapifyGeocoder = new GeoapifyGeocoder()
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

    private async processDispatch(now: Date): Promise<void> {
        const offsetRowVal = await this.settingsRepo.getGlobalSetting('holiday_offset_hours');
        const offsetHours = parseInt(offsetRowVal || '0', 10);
        const targetServiceDate = this.planner.getTargetServiceDate(now, offsetHours);
        const results = await this.subscriptionRepo.getDueSubscriptions(targetServiceDate);

        if (!results || results.length === 0) {
            console.log('No due subscriptions found.');
            return;
        }

        console.log(`Found ${results.length} due subscriptions. Checking for tomorrow's stops...`);

        const activeResults: DueSubscriptionResult[] = [];
        for (const row of results) {
            const isPaused = await this.subscriptionRepo.isSubscriptionPaused(row.id);
            if (isPaused) {
                console.log(`Skipping ${row.id}: subscription paused during processing.`);
                continue;
            }
            activeResults.push(row);
        }

        const plan = this.planner.planDueDispatches(now, activeResults, offsetHours);

        if (plan.stops.length === 0) {
            console.log('No due subscriptions scheduled for tomorrow.');
            return;
        }

        const setup = await this.dispatchStopRepo.getDispatchSetupStatus();
        if (!setup.isConfigured || !setup.defaultDriverId || setup.depotLat === null || setup.depotLng === null) {
            console.error(`Dispatch setup incomplete. Missing: ${setup.missing.join(', ')}`);
            return;
        }

        const historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string; binQuantity?: number }> = [];
        const preparedStops = await this.prepareStops(plan.stops);
        const orderedIds = this.optimizer.optimize(
            { latitude: setup.depotLat, longitude: setup.depotLng },
            preparedStops.map((stop) => ({
                id: stop.subscription_id,
                latitude: stop.lat ?? null,
                longitude: stop.lng ?? null,
            }))
        );
        const sequenceBySubscription = new Map(orderedIds.map((id, index) => [id, index + 1]));
        const dispatchStops: CreateDispatchStopInput[] = [];

        for (const stop of preparedStops) {
            const historyId = crypto.randomUUID();
            historyInserts.push({
                id: historyId,
                subscriptionId: stop.subscription_id,
                date: plan.date,
                status: 'Pending',
                binQuantity: stop.bin_quantity,
            });
            dispatchStops.push({
                id: crypto.randomUUID(),
                subscriptionId: stop.subscription_id,
                serviceHistoryId: historyId,
                serviceDate: plan.date,
                driverSalesRepId: setup.defaultDriverId,
                routeSequenceOrder: sequenceBySubscription.get(stop.subscription_id) ?? dispatchStops.length + 1,
                customerName: stop.customer_name || null,
                rawAddress: stop.address,
                latitude: stop.lat ?? null,
                longitude: stop.lng ?? null,
                binCount: stop.bin_quantity ?? 1,
                customerScent: stop.customer_scent || null,
                serviceNotes: stop.service_notes || null,
                customerPhone: stop.customer_phone || null,
            });
        }

        try {
            const consumedFirstServiceSubscriptionIds = preparedStops
                .filter((stop) => stop.first_service_date === plan.date)
                .map((stop) => stop.subscription_id);
            await this.dispatchStopRepo.createDispatchRoute({
                history: historyInserts,
                stops: dispatchStops,
                consumedFirstService: {
                    subscriptionIds: consumedFirstServiceSubscriptionIds,
                    serviceDate: plan.date,
                },
            });
            console.log(`Generated ${dispatchStops.length} local dispatch stops for ${plan.date}.`);
        } catch (batchError) {
            console.error('Failed to persist dispatch results:', batchError);
        }
    }

    private async prepareStops(stops: PlannedDispatchCandidate[]): Promise<PlannedDispatchCandidate[]> {
        const prepared: PlannedDispatchCandidate[] = [];
        for (const stop of stops) {
            if ((stop.lat === undefined || stop.lng === undefined) && stop.address) {
                const result = await this.geocoder.geocode(stop.address);
                if (result) {
                    await this.dispatchStopRepo.updateAddressCoordinates(stop.address, result.latitude, result.longitude);
                    prepared.push({ ...stop, lat: result.latitude, lng: result.longitude });
                    continue;
                }
            }
            prepared.push(stop);
        }
        return prepared;
    }
}
