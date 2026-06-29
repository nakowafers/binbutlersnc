import { ISubscriptionRepository, IServiceHistoryRepository, ISettingsRepository } from '../db/types';
import { IRoutingService } from '../routing/types';
import { DispatchExecutionAdapter } from './DispatchExecutionAdapter';
import { DispatchPlanner } from './DispatchPlanner';

export class DispatchCoordinator {
    private readonly executionAdapter: DispatchExecutionAdapter;

    constructor(
        subscriptionRepo: ISubscriptionRepository,
        serviceHistoryRepo: IServiceHistoryRepository,
        settingsRepo: ISettingsRepository,
        routingService: IRoutingService
    ) {
        this.executionAdapter = new DispatchExecutionAdapter(
            subscriptionRepo,
            serviceHistoryRepo,
            settingsRepo,
            routingService,
            new DispatchPlanner()
        );
    }

    dispatchDueStops(anchorDate: Date): Promise<void> {
        return this.executionAdapter.dispatchDueStops(anchorDate);
    }

    retryFailedDispatches(maxRetries: number = 5): Promise<void> {
        return this.executionAdapter.retryFailedDispatches(maxRetries);
    }
}
