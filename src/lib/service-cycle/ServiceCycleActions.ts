import { assertEasternServiceDate } from './dates';
import { SERVICE_CYCLE_EXCEPTION_REASONS, ServiceCycleActor, ServiceCycleExceptionReason } from './types';
import { asServiceCycleInvariantError } from './invariants';

type CycleState = 'open' | 'exception' | 'fulfilled' | 'waived';

interface CatchUpSourceStop {
    id: string;
    subscription_id: string;
    cycle_due_date: string;
    driver_sales_rep_id: string;
    route_sequence_order: number;
    customer_name: string | null;
    raw_address: string;
    latitude: number | null;
    longitude: number | null;
    bin_count: number;
    customer_scent: string | null;
    service_notes: string | null;
    customer_phone: string | null;
}

export interface ApproveCatchUpServiceInput {
    cycleId: string;
    serviceDate: string;
    actor: ServiceCycleActor;
    occurredAt: string;
}

export interface WaiveServiceCycleInput {
    cycleId: string;
    reason: ServiceCycleExceptionReason;
    notes: string;
    actor: ServiceCycleActor;
    occurredAt: string;
}

/**
 * The application boundary for deliberate administrative exception resolution.
 * It deliberately creates only the approved Catch-Up Service Attempt; route
 * planning and normal recurring eligibility remain outside this module.
 */
export class ServiceCycleActions {
    constructor(private readonly db: D1Database) {}

    async approveCatchUpService(input: ApproveCatchUpServiceInput): Promise<void> {
        assertEasternServiceDate(input.serviceDate);
        this.assertAdministration(input.actor);
        const correlationKey = `catch-up-approved:${input.cycleId}:${input.serviceDate}`;
        if (await this.hasEvent(correlationKey)) return;
        const cycle = await this.getCycle(input.cycleId);
        if (cycle.state !== 'exception') throw new Error(`Only an exception Service Cycle can receive Catch-Up Service (current state: ${cycle.state})`);

        const source = await this.db.prepare(
            `SELECT id, subscription_id, cycle_due_date, driver_sales_rep_id, route_sequence_order,
                    customer_name, raw_address, latitude, longitude, bin_count, customer_scent, service_notes, customer_phone
             FROM dispatch_stops
             WHERE service_cycle_id = ? AND dispatch_status = 'skipped'
             ORDER BY updated_at DESC, id DESC LIMIT 1`
        ).bind(input.cycleId).first<CatchUpSourceStop>();
        if (!source) throw new Error('Catch-Up Service requires a previously skipped linked Service Attempt');

        const targetConflict = await this.db.prepare(
            'SELECT id FROM dispatch_stops WHERE subscription_id = ? AND service_date = ?'
        ).bind(source.subscription_id, input.serviceDate).first<{ id: string }>();
        if (targetConflict) throw new Error('The Catch-Up Service target date already has route work for this subscription');

        const suffix = `${input.cycleId}:${input.serviceDate}`;
        try {
            await this.db.batch([
                this.db.prepare(
                    `INSERT INTO service_history (
                    id, subscription_id, service_cycle_id, cycle_due_date, service_date, dispatch_status, bin_quantity, completed_at
                 ) VALUES (?, ?, ?, ?, ?, 'Pending', ?, NULL)`
                ).bind(`catch-up-history:${suffix}`, source.subscription_id, input.cycleId, source.cycle_due_date, input.serviceDate, source.bin_count),
                this.db.prepare(
                    `INSERT INTO dispatch_stops (
                    id, subscription_id, service_history_id, service_cycle_id, cycle_due_date, service_date, driver_sales_rep_id,
                    route_sequence_order, dispatch_status, customer_name, raw_address, latitude, longitude, bin_count,
                    customer_scent, service_notes, customer_phone
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(
                    `catch-up-stop:${suffix}`, source.subscription_id, `catch-up-history:${suffix}`, input.cycleId,
                    source.cycle_due_date, input.serviceDate, source.driver_sales_rep_id, source.route_sequence_order,
                    source.customer_name, source.raw_address, source.latitude, source.longitude, source.bin_count,
                    source.customer_scent, source.service_notes, source.customer_phone,
                ),
                this.db.prepare('UPDATE service_cycles SET state = ?, updated_at = ? WHERE id = ? AND state = ?')
                    .bind('open', input.occurredAt, input.cycleId, 'exception'),
                this.db.prepare(
                    `INSERT INTO service_cycle_events (
                    id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity,
                    occurred_at, reason, notes, correlation_key
                 ) VALUES (?, ?, 'transition', 'exception', 'open', ?, 'administration', ?, NULL, NULL, ?)`
                ).bind(`catch-up-approved:${suffix}`, input.cycleId, input.actor.id, input.occurredAt, correlationKey),
            ]);
        } catch (error) {
            if (await this.hasEvent(correlationKey)) return;
            throw asServiceCycleInvariantError(error, 'Catch-Up Service approval');
        }
    }

    async waiveServiceCycle(input: WaiveServiceCycleInput): Promise<void> {
        this.assertAdministration(input.actor);
        if (!SERVICE_CYCLE_EXCEPTION_REASONS.includes(input.reason)) throw new Error('A controlled Service Cycle exception reason is required');
        if (!input.notes.trim()) throw new Error('Notes are required to waive a Service Cycle');
        const correlationKey = `cycle-waived:${input.cycleId}`;
        if (await this.hasEvent(correlationKey)) return;
        const cycle = await this.getCycle(input.cycleId);
        if (cycle.state === 'waived') return;
        if (cycle.state !== 'exception') throw new Error(`Only an exception Service Cycle can be waived (current state: ${cycle.state})`);

        try {
            await this.db.batch([
                this.db.prepare('UPDATE service_cycles SET state = ?, updated_at = ? WHERE id = ? AND state = ?')
                    .bind('waived', input.occurredAt, input.cycleId, 'exception'),
                this.db.prepare(
                `INSERT INTO service_cycle_events (
                    id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity,
                    occurred_at, reason, notes, correlation_key
                 ) VALUES (?, ?, 'transition', 'exception', 'waived', ?, 'administration', ?, ?, ?, ?)`
                ).bind(`cycle-waived:${input.cycleId}`, input.cycleId, input.actor.id, input.occurredAt, input.reason, input.notes.trim(), correlationKey),
            ]);
        } catch (error) {
            if (await this.hasEvent(correlationKey)) return;
            throw asServiceCycleInvariantError(error, 'cycle waiver');
        }
    }

    private async getCycle(id: string): Promise<{ state: CycleState }> {
        const cycle = await this.db.prepare('SELECT state FROM service_cycles WHERE id = ?').bind(id).first<{ state: CycleState }>();
        if (!cycle) throw new Error(`Service Cycle ${id} was not found`);
        return cycle;
    }

    private async hasEvent(correlationKey: string): Promise<boolean> {
        return !!await this.db.prepare('SELECT id FROM service_cycle_events WHERE correlation_key = ?')
            .bind(correlationKey).first<{ id: string }>();
    }

    private assertAdministration(actor: ServiceCycleActor): void {
        if (actor.capacity !== 'administration') throw new Error('Only administration can resolve a Service Cycle exception');
    }
}
