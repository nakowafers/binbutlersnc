export const SERVICE_CYCLE_STATES = ['open', 'exception', 'fulfilled', 'waived'] as const;
export type ServiceCycleState = (typeof SERVICE_CYCLE_STATES)[number];

export const SERVICE_CYCLE_EXCEPTION_REASONS = [
    'access_unavailable', 'bins_not_out', 'weather_or_holiday', 'billing_delinquency',
    'vacation_pause', 'customer_request', 'operational_failure', 'data_integrity', 'other',
] as const;
export type ServiceCycleExceptionReason = (typeof SERVICE_CYCLE_EXCEPTION_REASONS)[number];

export const SERVICE_CYCLE_ACTOR_CAPACITIES = ['sales', 'fulfillment', 'administration', 'system'] as const;
export type ServiceCycleActorCapacity = (typeof SERVICE_CYCLE_ACTOR_CAPACITIES)[number];
export type ServiceCycleEventType = 'created' | 'transition' | 'correction';

export interface ServiceCycle {
    id: string;
    subscription_id: string;
    cycle_due_date: string;
    state: ServiceCycleState;
    created_at: string;
    updated_at: string;
}

export interface ServiceCycleEvent {
    id: string;
    service_cycle_id: string;
    event_type: ServiceCycleEventType;
    from_state: ServiceCycleState | null;
    to_state: ServiceCycleState;
    actor_id: string;
    actor_capacity: ServiceCycleActorCapacity;
    occurred_at: string;
    reason: ServiceCycleExceptionReason | null;
    notes: string | null;
    correlation_key: string;
    created_at: string;
}

export interface ServiceCycleActor {
    id: string;
    capacity: ServiceCycleActorCapacity;
}

export interface CreateServiceCycleInput {
    id: string;
    subscriptionId: string;
    cycleDueDate: string;
    actor: ServiceCycleActor;
    occurredAt: string;
    correlationKey: string;
    eventId: string;
    notes?: string | null;
}

export interface TransitionServiceCycleInput {
    cycleId: string;
    toState: ServiceCycleState;
    actor: ServiceCycleActor;
    occurredAt: string;
    correlationKey: string;
    eventId: string;
    reason?: ServiceCycleExceptionReason | null;
    notes?: string | null;
}
