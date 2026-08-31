export type ServiceCycleInvariantCode = 'invalid_date' | 'duplicate_cycle' | 'duplicate_completion' | 'concurrent_transition';

/**
 * Converts D1 constraint failures into stable, PII-free operational errors.
 * Callers must stop the write: a retry is safe only after re-reading state.
 */
export class ServiceCycleInvariantError extends Error {
    constructor(readonly code: ServiceCycleInvariantCode, readonly action: string) {
        super(`Service Cycle invariant blocked ${action}: ${messageFor(code)}`);
        this.name = 'ServiceCycleInvariantError';
    }
}

function messageFor(code: ServiceCycleInvariantCode): string {
    switch (code) {
        case 'invalid_date': return 'a canonical Eastern Service Date is required';
        case 'duplicate_cycle': return 'this Subscription already has that Cycle Due Date';
        case 'duplicate_completion': return 'this Service Cycle already has a successful completion';
        case 'concurrent_transition': return 'the cycle changed concurrently; re-read it before retrying';
    }
}

export function asServiceCycleInvariantError(error: unknown, action: string): Error {
    if (error instanceof ServiceCycleInvariantError) return error;
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('service_cycle_invalid_date')) return new ServiceCycleInvariantError('invalid_date', action);
    if (message.includes('service_history_one_completed_per_cycle') || message.includes('service_history.service_cycle_id')) {
        return new ServiceCycleInvariantError('duplicate_completion', action);
    }
    if (message.includes('service_cycles.subscription_id, service_cycles.cycle_due_date')) return new ServiceCycleInvariantError('duplicate_cycle', action);
    if (message.includes('Service Cycle event target does not match') || message.includes('Service Cycle event source does not match')) {
        return new ServiceCycleInvariantError('concurrent_transition', action);
    }
    return error instanceof Error ? error : new Error('Service Cycle write failed without a usable error');
}
