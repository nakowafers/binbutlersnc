import { ServiceDayReanchorRepository, ServiceDayReanchorSnapshot } from './ServiceDayReanchor';

type CycleForAudit = { id: string; state: 'open' | 'exception' | 'fulfilled' | 'waived' };

/** D1 implementation with compare-and-set writes and append-only cycle evidence. */
export class D1ServiceDayReanchorRepository implements ServiceDayReanchorRepository {
    constructor(private readonly db: D1Database) {}

    async getSnapshot(subscriptionId: string): Promise<ServiceDayReanchorSnapshot | null> {
        return await this.db.prepare(
            `SELECT s.id AS subscriptionId, s.stripe_subscription_id AS stripeSubscriptionId, s.status,
                    c.address_id AS addressId, a.service_day AS serviceDay, a.trash_day AS trashDay,
                    s.service_cycle_anchor AS serviceCycleAnchor, s.frequency_days AS frequencyDays,
                    s.current_period_end AS currentPeriodEnd
             FROM subscriptions s
             JOIN customers c ON c.id = s.customer_id
             JOIN addresses a ON a.id = c.address_id
             WHERE s.id = ?`
        ).bind(subscriptionId).first<ServiceDayReanchorSnapshot>();
    }

    async hasServiceCycle(subscriptionId: string, cycleDueDate: string): Promise<boolean> {
        return !!await this.db.prepare(
            'SELECT id FROM service_cycles WHERE subscription_id = ? AND cycle_due_date = ?'
        ).bind(subscriptionId, cycleDueDate).first<{ id: string }>();
    }

    async hasAppliedReanchor(correlationKey: string): Promise<boolean> {
        return !!await this.db.prepare('SELECT id FROM service_cycle_events WHERE correlation_key = ?').bind(correlationKey).first<{ id: string }>();
    }

    async applyReanchor(input: Parameters<ServiceDayReanchorRepository['applyReanchor']>[0]): Promise<boolean> {
        const cycle = await this.db.prepare(
            `SELECT id, state FROM service_cycles
             WHERE subscription_id = ? AND cycle_due_date = ?`
        ).bind(input.expected.subscriptionId, input.proposal.serviceCycleAnchor).first<CycleForAudit>();
        if (!cycle) throw new Error('Re-anchor requires the proposed Service Cycle for append-only audit evidence');

        const notes = JSON.stringify({
            operation: 'service_day_reanchor',
            old: { serviceDay: input.expected.serviceDay, serviceCycleAnchor: input.expected.serviceCycleAnchor, currentPeriodEnd: input.expected.currentPeriodEnd },
            next: input.proposal,
            reason: input.reason,
        });
        const eventId = `service-day-reanchor:${input.correlationKey}`;
        await this.db.batch([
            this.db.prepare(
                `UPDATE subscriptions SET service_cycle_anchor = ?
                 WHERE id = ? AND status = 'active' AND frequency_days = ?
                   AND service_cycle_anchor = ? AND current_period_end = ?
                   AND EXISTS (
                       SELECT 1 FROM customers c
                       JOIN addresses a ON a.id = c.address_id
                       WHERE c.id = subscriptions.customer_id
                         AND a.id = ? AND a.service_day = ?
                   )`
            ).bind(input.proposal.serviceCycleAnchor, input.expected.subscriptionId, input.expected.frequencyDays, input.expected.serviceCycleAnchor, input.expected.currentPeriodEnd, input.expected.addressId, input.expected.serviceDay),
            this.db.prepare(
                `UPDATE addresses SET service_day = ?
                 WHERE id = ? AND service_day = ?
                   AND EXISTS (
                       SELECT 1 FROM subscriptions s
                       WHERE s.id = ? AND s.status = 'active'
                         AND s.frequency_days = ?
                         AND s.service_cycle_anchor = ?
                         AND s.current_period_end = ?
                   )`
            ).bind(input.proposal.serviceDay, input.expected.addressId, input.expected.serviceDay, input.expected.subscriptionId, input.expected.frequencyDays, input.proposal.serviceCycleAnchor, input.expected.currentPeriodEnd),
            this.db.prepare(
                `INSERT INTO service_cycle_events (
                    id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity,
                    occurred_at, reason, notes, correlation_key
                 ) VALUES (
                    ?,
                    (SELECT sc.id FROM service_cycles sc
                     JOIN subscriptions s ON s.id = sc.subscription_id
                     JOIN customers c ON c.id = s.customer_id
                     JOIN addresses a ON a.id = c.address_id
                     WHERE sc.id = ? AND sc.state = ?
                       AND s.service_cycle_anchor = ? AND a.service_day = ?
                       AND (SELECT to_state FROM service_cycle_events WHERE service_cycle_id = sc.id ORDER BY rowid DESC LIMIT 1) = sc.state),
                    'correction', ?, ?, ?, 'administration', ?, 'data_integrity', ?, ?
                 )`
            ).bind(eventId, cycle.id, cycle.state, input.proposal.serviceCycleAnchor, input.proposal.serviceDay, cycle.state, cycle.state, input.actor.id, input.occurredAt, notes, input.correlationKey),
        ]);
        const applied = await this.hasAppliedReanchor(input.correlationKey);
        if (!applied) return false;

        const after = await this.getSnapshot(input.expected.subscriptionId);
        return after?.serviceDay === input.proposal.serviceDay
            && after.serviceCycleAnchor === input.proposal.serviceCycleAnchor
            && after.currentPeriodEnd === input.expected.currentPeriodEnd;
    }
}
