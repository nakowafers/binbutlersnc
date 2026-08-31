import {
    CreateServiceCycleInput, ServiceCycle, ServiceCycleEvent, ServiceCycleState, TransitionServiceCycleInput,
} from './types';
import { assertEasternServiceDate } from './dates';

export interface IServiceCycleRepository {
    createCycle(input: CreateServiceCycleInput): Promise<ServiceCycle>;
    transitionCycle(input: TransitionServiceCycleInput): Promise<ServiceCycle>;
    getCycle(id: string): Promise<ServiceCycle | null>;
    getEvents(cycleId: string): Promise<ServiceCycleEvent[]>;
}

const ALLOWED_TRANSITIONS: Record<ServiceCycleState, readonly ServiceCycleState[]> = {
    open: ['exception', 'fulfilled'],
    exception: ['open', 'fulfilled', 'waived'],
    fulfilled: [],
    waived: [],
};

function assertActor(actor: TransitionServiceCycleInput['actor']): void {
    if (!['sales', 'fulfillment', 'administration', 'system'].includes(actor.capacity)) throw new Error('A valid Service Cycle actor capacity is required');
}

function assertReason(reason: TransitionServiceCycleInput['reason']): void {
    if (reason != null && !['access_unavailable', 'bins_not_out', 'weather_or_holiday', 'billing_delinquency', 'vacation_pause', 'customer_request', 'operational_failure', 'data_integrity', 'other'].includes(reason)) {
        throw new Error('A controlled Service Cycle exception reason is required');
    }
}

export function assertCreateServiceCycleInput(input: CreateServiceCycleInput): void {
    assertEasternServiceDate(input.cycleDueDate);
    assertActor(input.actor);
}

export function assertServiceCycleTransition(
    fromState: ServiceCycleState,
    input: Pick<TransitionServiceCycleInput, 'toState' | 'actor' | 'reason' | 'notes'>,
): 'transition' | 'correction' {
    assertActor(input.actor);
    assertReason(input.reason);
    const notes = input.notes?.trim();
    const requiresNotes = input.reason === 'other' || input.toState === 'waived' || input.reason === 'data_integrity';
    if (requiresNotes && !notes) throw new Error('Notes are required for other, waiver, and data correction actions');
    if (input.toState === 'waived' && input.actor.capacity !== 'administration') throw new Error('Only administration can waive a Service Cycle');
    if (ALLOWED_TRANSITIONS[fromState].includes(input.toState)) return 'transition';
    if ((fromState === 'fulfilled' || fromState === 'waived') &&
        (input.toState === 'open' || input.toState === 'exception') &&
        input.actor.capacity === 'administration' && input.reason === 'data_integrity') return 'correction';
    throw new Error(`Invalid Service Cycle transition from ${fromState} to ${input.toState}`);
}
