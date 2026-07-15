import { ISubscriptionRepository, IServiceHistoryRepository, ISettingsRepository, IDispatchStopRepository } from '../db/types';
import { GeoapifyGeocoder } from '../geocoding/GeoapifyGeocoder';
import { DispatchExecutionAdapter } from './DispatchExecutionAdapter';
import { DispatchPlanner } from './DispatchPlanner';
import { RouteOptimizer } from './RouteOptimizer';

export class DispatchCoordinator {
    private readonly executionAdapter: DispatchExecutionAdapter;

    constructor(
        subscriptionRepo: ISubscriptionRepository,
        serviceHistoryRepo: IServiceHistoryRepository,
        settingsRepo: ISettingsRepository,
        dispatchStopRepo: IDispatchStopRepository,
        geocoder: GeoapifyGeocoder = new GeoapifyGeocoder()
    ) {
        this.executionAdapter = new DispatchExecutionAdapter(
            subscriptionRepo,
            serviceHistoryRepo,
            settingsRepo,
            dispatchStopRepo,
            new DispatchPlanner(),
            new RouteOptimizer(),
            geocoder
        );
    }

    dispatchDueStops(anchorDate: Date): Promise<void> {
        return this.executionAdapter.dispatchDueStops(anchorDate);
    }

}
