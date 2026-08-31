import { IServiceCycleRepository, assertCreateServiceCycleInput, assertServiceCycleTransition } from '@/lib/service-cycle/ServiceCycleRepository';
import { CreateServiceCycleInput, ServiceCycle, ServiceCycleEvent, TransitionServiceCycleInput } from '@/lib/service-cycle/types';
import { asServiceCycleInvariantError } from '@/lib/service-cycle/invariants';

export class D1ServiceCycleRepositoryAdapter implements IServiceCycleRepository {
    constructor(private readonly db: D1Database) {}

    async createCycle(input: CreateServiceCycleInput): Promise<ServiceCycle> {
        assertCreateServiceCycleInput(input);
        const existing = await this.getCycleByCorrelationKey(input.correlationKey);
        if (existing) return existing;
        try {
            await this.db.batch([
                this.db.prepare('INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES (?, ?, ?, ?)').bind(input.id, input.subscriptionId, input.cycleDueDate, 'open'),
                this.db.prepare(`INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, reason, notes, correlation_key) VALUES (?, ?, 'created', NULL, 'open', ?, ?, ?, NULL, ?, ?)`).bind(input.eventId, input.id, input.actor.id, input.actor.capacity, input.occurredAt, input.notes?.trim() || null, input.correlationKey),
            ]);
        } catch (error) {
            const idempotent = await this.getCycleByCorrelationKey(input.correlationKey);
            if (idempotent) return idempotent;
            throw asServiceCycleInvariantError(error, 'cycle creation');
        }
        return (await this.getCycle(input.id))!;
    }

    async transitionCycle(input: TransitionServiceCycleInput): Promise<ServiceCycle> {
        const idempotent = await this.getCycleByCorrelationKey(input.correlationKey);
        if (idempotent) return idempotent;
        const cycle = await this.getCycle(input.cycleId);
        if (!cycle) throw new Error(`Service Cycle ${input.cycleId} was not found`);
        const eventType = assertServiceCycleTransition(cycle.state, input);
        try {
            await this.db.batch([
                this.db.prepare('UPDATE service_cycles SET state = ?, updated_at = ? WHERE id = ? AND state = ?').bind(input.toState, input.occurredAt, input.cycleId, cycle.state),
                this.db.prepare('INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, reason, notes, correlation_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(input.eventId, input.cycleId, eventType, cycle.state, input.toState, input.actor.id, input.actor.capacity, input.occurredAt, input.reason ?? null, input.notes?.trim() || null, input.correlationKey),
            ]);
        } catch (error) {
            const replay = await this.getCycleByCorrelationKey(input.correlationKey);
            if (replay) return replay;
            throw asServiceCycleInvariantError(error, 'cycle transition');
        }
        const updated = await this.getCycle(input.cycleId);
        if (!updated || updated.state !== input.toState) throw new Error('Service Cycle transition did not apply');
        return updated;
    }

    async getCycle(id: string): Promise<ServiceCycle | null> {
        return await this.db.prepare('SELECT * FROM service_cycles WHERE id = ?').bind(id).first<ServiceCycle>();
    }

    async getEvents(cycleId: string): Promise<ServiceCycleEvent[]> {
        const result = await this.db.prepare('SELECT * FROM service_cycle_events WHERE service_cycle_id = ? ORDER BY occurred_at, rowid').bind(cycleId).all<ServiceCycleEvent>();
        return result.results;
    }

    private async getCycleByCorrelationKey(correlationKey: string): Promise<ServiceCycle | null> {
        return await this.db.prepare('SELECT sc.* FROM service_cycle_events sce JOIN service_cycles sc ON sc.id = sce.service_cycle_id WHERE sce.correlation_key = ?').bind(correlationKey).first<ServiceCycle>();
    }
}
