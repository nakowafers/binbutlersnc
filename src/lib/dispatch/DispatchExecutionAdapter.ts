import { ISubscriptionRepository, IServiceHistoryRepository, ISettingsRepository, DueSubscriptionResult, IDispatchStopRepository, CreateDispatchStopInput } from '../db/types';
import { GeoapifyGeocoder } from '../geocoding/GeoapifyGeocoder';
import { DispatchPlanner, PlannedDispatchCandidate } from './DispatchPlanner';
import { RouteOptimizer } from './RouteOptimizer';
import { buildCycleShadowParityReport } from '../reports/serviceCycleShadowParity';
import { buildServiceCycleDispatchCutoverReport, hasServiceCycleDispatchParity, isServiceCycleDispatchCutoverApproved, SERVICE_CYCLE_DISPATCH_CUTOVER_SETTING } from './serviceCycleDispatchCutover';

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
        const targetCycleDueDate = this.planner.getTargetCycleDueDate(now);
        const legacyResults = await this.subscriptionRepo.getDueSubscriptions(targetCycleDueDate, targetServiceDate);
        const cutoverSetting = await this.settingsRepo.getGlobalSetting(SERVICE_CYCLE_DISPATCH_CUTOVER_SETTING);
        const cutoverApproved = isServiceCycleDispatchCutoverApproved(cutoverSetting);
        let results = legacyResults;
        let legacyPlan = this.planner.planDueDispatches(now, legacyResults, offsetHours);

        if (cutoverApproved && this.subscriptionRepo.getCycleEligibleSubscriptions) {
            const cycleEligibility = await this.subscriptionRepo.getCycleEligibleSubscriptions(targetCycleDueDate, targetServiceDate);
            const cyclePlan = this.planner.planDueDispatches(now, cycleEligibility.dueSubscriptions, offsetHours);
            const cutoverReport = buildServiceCycleDispatchCutoverReport(
                legacyPlan.stops.map((stop) => stop.subscription_id),
                cyclePlan.stops.map((stop) => stop.subscription_id),
                cycleEligibility.reviewSubscriptionIds,
                cycleEligibility.recoveryReviewSuppressions || [],
            );
            if (cutoverReport.reviewSubscriptionIds.length > 0) {
                console.warn(`Service Cycle dispatch review required: ${JSON.stringify({
                    reviewSubscriptionIds: cutoverReport.reviewSubscriptionIds,
                    recoveryReviewSuppressions: cutoverReport.recoveryReviewSuppressions,
                })}`);
            }
            if (!hasServiceCycleDispatchParity(cutoverReport)) {
                console.warn(`Service Cycle dispatch parity changed: ${JSON.stringify(cutoverReport)}`);
            }
            // Once the fail-closed approval gate is enabled, open Service Cycles are
            // the authority. Legacy results remain diagnostic-only for rollback and
            // parity reporting; they never replace an explicitly open cycle.
            results = cycleEligibility.dueSubscriptions;
            legacyPlan = cyclePlan;
        }

        if (!results || results.length === 0) {
            await this.reportCycleShadowParity(targetCycleDueDate, legacyPlan.stops.map((stop) => stop.subscription_id));
            console.log('No due subscriptions found.');
            return;
        }

        console.log(`Found ${results.length} due subscriptions. Checking for tomorrow's stops...`);

        const activeResults: DueSubscriptionResult[] = [];
        for (const row of results) {
            const isPaused = await this.subscriptionRepo.isSubscriptionPaused(row.id);
            if (isPaused) {
                await this.subscriptionRepo.recordCycleException?.({
                    subscriptionId: row.id,
                    cycleDueDate: targetCycleDueDate,
                    reason: 'vacation_pause',
                    occurredAt: now.toISOString(),
                    correlationKey: `vacation-pause:${row.id}:${targetCycleDueDate}`,
                });
                console.log(`Suppressed ${row.id}: subscription paused during processing.`);
                continue;
            }
            activeResults.push(row);
        }

        const plan = this.planner.planDueDispatches(now, activeResults, offsetHours);
        await this.reportCycleShadowParity(targetCycleDueDate, legacyPlan.stops.map((stop) => stop.subscription_id));

        if (plan.stops.length === 0) {
            console.log('No due subscriptions scheduled for tomorrow.');
            return;
        }

        const setup = await this.dispatchStopRepo.getDispatchSetupStatus();
        if (!setup.isConfigured || !setup.defaultDriverId || setup.depotLat === null || setup.depotLng === null) {
            console.error(`Dispatch setup incomplete. Missing: ${setup.missing.join(', ')}`);
            return;
        }

        const historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string; binQuantity?: number; serviceCycleId?: string; cycleDueDate?: string }> = [];
        const cycleInserts: NonNullable<Parameters<typeof this.dispatchStopRepo.createDispatchRoute>[0]['cycles']> = [];
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
            const isCycleTracked = [0, 28, 56, 84].includes(stop.frequency_days ?? -1);
            const cycleId = stop.service_cycle_id ?? (isCycleTracked ? `shadow-cycle:${stop.subscription_id}:${targetCycleDueDate}` : undefined);
            const cycleDueDate = stop.cycle_due_date ?? targetCycleDueDate;
            const historyId = cycleId ? `shadow-history:${stop.subscription_id}:${targetServiceDate}` : crypto.randomUUID();
            if (isCycleTracked && cycleId && !stop.service_cycle_id) {
                cycleInserts.push({
                    id: cycleId,
                    subscriptionId: stop.subscription_id,
                    cycleDueDate: targetCycleDueDate,
                    eventId: `shadow-cycle-created:${stop.subscription_id}:${targetCycleDueDate}`,
                    occurredAt: now.toISOString(),
                    correlationKey: `shadow-dispatch:${stop.subscription_id}:${targetCycleDueDate}`,
                });
            }
            historyInserts.push({
                id: historyId,
                subscriptionId: stop.subscription_id,
                date: plan.date,
                status: 'Pending',
                binQuantity: stop.bin_quantity,
                serviceCycleId: cycleId,
                cycleDueDate: cycleId ? cycleDueDate : undefined,
            });
            dispatchStops.push({
                id: isCycleTracked ? `shadow-stop:${stop.subscription_id}:${targetServiceDate}` : crypto.randomUUID(),
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
                serviceCycleId: cycleId,
                cycleDueDate: cycleId ? cycleDueDate : null,
            });
        }

        try {
            const consumedFirstServiceSubscriptionIds = preparedStops
                .filter((stop) => stop.first_service_date === targetCycleDueDate)
                .map((stop) => stop.subscription_id);
            await this.dispatchStopRepo.createDispatchRoute({
                cycles: cycleInserts,
                history: historyInserts,
                stops: dispatchStops,
                consumedFirstService: {
                    subscriptionIds: consumedFirstServiceSubscriptionIds,
                    serviceDate: targetCycleDueDate,
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

    private async reportCycleShadowParity(targetCycleDueDate: string, legacySelectedSubscriptionIds: string[]): Promise<void> {
        if (!this.subscriptionRepo.getCycleShadowSubscriptions) return;
        const targetDay = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(`${targetCycleDueDate}T12:00:00.000Z`).getUTCDay()];
        const subscriptions = await this.subscriptionRepo.getCycleShadowSubscriptions();
        const report = buildCycleShadowParityReport({
            targetCycleDueDate,
            legacySelectedSubscriptionIds,
            subscriptions: subscriptions
                .filter((subscription) => subscription.serviceDay?.toUpperCase() === targetDay)
                .map(({ subscriptionId, frequencyDays, serviceCycleAnchor, completedServiceDates }) => ({ subscriptionId, frequencyDays, serviceCycleAnchor, completedServiceDates })),
        });
        console.log(`Service Cycle shadow parity: ${JSON.stringify(report)}`);
    }
}
