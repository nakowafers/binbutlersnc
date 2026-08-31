import { assertEasternServiceDate } from '@/lib/service-cycle/dates';

export const MB_AUGUST_31_CYCLE_DUE_DATE = '2026-08-31';

export interface MbAugust31RecoveryPlanInput {
    subscriptionId: string;
    allowlistedSubscriptionId: string;
    cycleId: string;
    historyId: string;
    stopId: string;
    eventId: string;
    driverSalesRepId: string;
    routeSequenceOrder: number;
    occurredAt: string;
}

export interface MbAugust31RecoveryPlan extends MbAugust31RecoveryPlanInput {
    cycleDueDate: typeof MB_AUGUST_31_CYCLE_DUE_DATE;
    correlationKey: string;
}

export interface RecoveryCounts {
    subscriptions: number;
    addresses: number;
    activeDrivers: number;
    cycles: number;
    pendingAttempts: number;
    assignedStops: number;
    auditEvents: number;
}

export interface InverseRepairPlan {
    kind: 'audited_correction_required';
    retainAuditEvidence: true;
    subscriptionId: string;
    cycleId: string;
    historyId: string;
    stopId: string;
    eventId: string;
    steps: readonly ['verify_no_fulfillment', 'remove_planned_stop_and_attempt', 'append_cycle_correction'];
}

export interface MbAugust31Preflight {
    outcome: 'fallback_ready' | 'verified_noop' | 'mismatch';
    cycleDueDate: string;
    subscriptionId: string;
    counts: RecoveryCounts;
    inverseRepair: InverseRepairPlan;
}

function assertExactPlan(input: MbAugust31RecoveryPlanInput): void {
    if (input.subscriptionId !== input.allowlistedSubscriptionId || !input.subscriptionId) {
        throw new Error('Recovery requires the exact allowlisted Subscription.');
    }
    if (!Number.isInteger(input.routeSequenceOrder) || input.routeSequenceOrder < 1) {
        throw new Error('Recovery requires a positive route sequence order.');
    }
    if (Number.isNaN(new Date(input.occurredAt).getTime())) {
        throw new Error('Recovery requires a valid audit occurrence time.');
    }
    const ids = [input.cycleId, input.historyId, input.stopId, input.eventId];
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
        throw new Error('Recovery requires four distinct expected record identities.');
    }
}

export function createMbAugust31RecoveryPlan(input: MbAugust31RecoveryPlanInput): MbAugust31RecoveryPlan {
    assertExactPlan(input);
    assertEasternServiceDate(MB_AUGUST_31_CYCLE_DUE_DATE);
    return {
        ...input,
        cycleDueDate: MB_AUGUST_31_CYCLE_DUE_DATE,
        correlationKey: `service-cycle-anchor-recovery:mb:2026-08-31:${input.subscriptionId}`,
    };
}

function inverseRepair(plan: MbAugust31RecoveryPlan): InverseRepairPlan {
    return {
        kind: 'audited_correction_required',
        retainAuditEvidence: true,
        subscriptionId: plan.subscriptionId,
        cycleId: plan.cycleId,
        historyId: plan.historyId,
        stopId: plan.stopId,
        eventId: plan.eventId,
        steps: ['verify_no_fulfillment', 'remove_planned_stop_and_attempt', 'append_cycle_correction'],
    };
}

async function count(db: D1Database, query: string, ...args: string[]): Promise<number> {
    const result = await db.prepare(query).bind(...args).first<{ count: number }>();
    return result?.count ?? 0;
}

export async function preflightMbAugust31RouteRecovery(db: D1Database, plan: MbAugust31RecoveryPlan): Promise<MbAugust31Preflight> {
    assertExactPlan(plan);
    if (plan.cycleDueDate !== MB_AUGUST_31_CYCLE_DUE_DATE) throw new Error('Recovery is fixed to the August 31 Cycle Due Date.');

    const [subscriptions, addresses, activeDrivers, cycles, attempts, stops, events, linkedAttempts, linkedStops] = await Promise.all([
        count(db, 'SELECT count(*) AS count FROM subscriptions WHERE id = ? AND status = \'active\'', plan.subscriptionId),
        count(db, 'SELECT count(*) AS count FROM addresses a JOIN subscriptions s ON s.customer_id = a.customer_id WHERE s.id = ?', plan.subscriptionId),
        count(db, 'SELECT count(*) AS count FROM sales_reps WHERE id = ? AND is_admin = 1 AND COALESCE(is_active, 1) = 1', plan.driverSalesRepId),
        count(db, 'SELECT count(*) AS count FROM service_cycles WHERE subscription_id = ? AND cycle_due_date = ?', plan.subscriptionId, plan.cycleDueDate),
        count(db, "SELECT count(*) AS count FROM service_history WHERE subscription_id = ? AND service_date = ? AND dispatch_status = 'Pending'", plan.subscriptionId, plan.cycleDueDate),
        count(db, "SELECT count(*) AS count FROM dispatch_stops WHERE subscription_id = ? AND service_date = ? AND dispatch_status = 'assigned'", plan.subscriptionId, plan.cycleDueDate),
        count(db, "SELECT count(*) AS count FROM service_cycle_events e JOIN service_cycles c ON c.id = e.service_cycle_id WHERE c.subscription_id = ? AND c.cycle_due_date = ? AND e.event_type = 'created' AND e.to_state = 'open'", plan.subscriptionId, plan.cycleDueDate),
        count(db, "SELECT count(*) AS count FROM service_history h JOIN service_cycles c ON c.id = h.service_cycle_id WHERE c.subscription_id = ? AND c.cycle_due_date = ? AND h.service_date = ? AND h.cycle_due_date = ? AND h.dispatch_status = 'Pending'", plan.subscriptionId, plan.cycleDueDate, plan.cycleDueDate, plan.cycleDueDate),
        count(db, "SELECT count(*) AS count FROM dispatch_stops d JOIN service_history h ON h.id = d.service_history_id JOIN service_cycles c ON c.id = d.service_cycle_id WHERE c.subscription_id = ? AND c.cycle_due_date = ? AND d.service_date = ? AND d.cycle_due_date = ? AND d.dispatch_status = 'assigned' AND h.dispatch_status = 'Pending'", plan.subscriptionId, plan.cycleDueDate, plan.cycleDueDate, plan.cycleDueDate),
    ]);
    const counts = { subscriptions, addresses, activeDrivers, cycles, pendingAttempts: attempts, assignedStops: stops, auditEvents: events };
    const prerequisites = subscriptions === 1 && addresses === 1 && activeDrivers === 1;
    const absent = cycles === 0 && attempts === 0 && stops === 0 && events === 0;
    const complete = cycles === 1 && attempts === 1 && stops === 1 && events === 1 && linkedAttempts === 1 && linkedStops === 1;
    return {
        outcome: prerequisites && absent ? 'fallback_ready' : prerequisites && complete ? 'verified_noop' : 'mismatch',
        cycleDueDate: plan.cycleDueDate,
        subscriptionId: plan.subscriptionId,
        counts,
        inverseRepair: inverseRepair(plan),
    };
}

async function assertExpectedFallbackIdentities(db: D1Database, plan: MbAugust31RecoveryPlan): Promise<void> {
    const [cycle, attempt, stop, event] = await Promise.all([
        count(db, "SELECT count(*) AS count FROM service_cycles WHERE id = ? AND subscription_id = ? AND cycle_due_date = ? AND state = 'open'", plan.cycleId, plan.subscriptionId, plan.cycleDueDate),
        count(db, "SELECT count(*) AS count FROM service_history WHERE id = ? AND subscription_id = ? AND service_cycle_id = ? AND cycle_due_date = ? AND service_date = ? AND dispatch_status = 'Pending' AND completed_at IS NULL", plan.historyId, plan.subscriptionId, plan.cycleId, plan.cycleDueDate, plan.cycleDueDate),
        count(db, "SELECT count(*) AS count FROM dispatch_stops WHERE id = ? AND subscription_id = ? AND service_history_id = ? AND service_cycle_id = ? AND cycle_due_date = ? AND service_date = ? AND dispatch_status = 'assigned'", plan.stopId, plan.subscriptionId, plan.historyId, plan.cycleId, plan.cycleDueDate, plan.cycleDueDate),
        count(db, "SELECT count(*) AS count FROM service_cycle_events WHERE id = ? AND service_cycle_id = ? AND event_type = 'created' AND to_state = 'open' AND correlation_key = ?", plan.eventId, plan.cycleId, plan.correlationKey),
    ]);
    if (cycle !== 1 || attempt !== 1 || stop !== 1 || event !== 1) {
        throw new Error('Recovery post-write identity verification failed; stop and use the precomputed inverse repair plan.');
    }
}

export async function applyMbAugust31RouteFallback(db: D1Database, plan: MbAugust31RecoveryPlan): Promise<{ outcome: 'fallback_applied' | 'verified_noop'; preflight: MbAugust31Preflight; postflight: MbAugust31Preflight }> {
    const preflight = await preflightMbAugust31RouteRecovery(db, plan);
    if (preflight.outcome === 'verified_noop') return { outcome: 'verified_noop', preflight, postflight: preflight };
    if (preflight.outcome !== 'fallback_ready') throw new Error('Recovery preflight mismatch; no fallback write was attempted.');

    await db.batch([
        db.prepare(`INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state)
            SELECT ?, ?, ?, 'open'
            WHERE EXISTS (SELECT 1 FROM subscriptions WHERE id = ? AND status = 'active')
              AND NOT EXISTS (SELECT 1 FROM service_cycles WHERE subscription_id = ? AND cycle_due_date = ?)
              AND NOT EXISTS (SELECT 1 FROM service_history WHERE subscription_id = ? AND service_date = ?)
              AND NOT EXISTS (SELECT 1 FROM dispatch_stops WHERE subscription_id = ? AND service_date = ?)`)
            .bind(plan.cycleId, plan.subscriptionId, plan.cycleDueDate, plan.subscriptionId, plan.subscriptionId, plan.cycleDueDate, plan.subscriptionId, plan.cycleDueDate, plan.subscriptionId, plan.cycleDueDate),
        db.prepare(`INSERT INTO service_cycle_events (id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity, occurred_at, reason, notes, correlation_key)
            VALUES (?, ?, 'created', NULL, 'open', 'recovery-system', 'system', ?, NULL, 'narrow_allowlisted_route_recovery', ?)`)
            .bind(plan.eventId, plan.cycleId, plan.occurredAt, plan.correlationKey),
        db.prepare(`INSERT INTO service_history (id, subscription_id, service_cycle_id, cycle_due_date, service_date, dispatch_status, completed_at)
            VALUES (?, ?, ?, ?, ?, 'Pending', NULL)`)
            .bind(plan.historyId, plan.subscriptionId, plan.cycleId, plan.cycleDueDate, plan.cycleDueDate),
        db.prepare(`INSERT INTO dispatch_stops (id, subscription_id, service_history_id, service_cycle_id, cycle_due_date, service_date, driver_sales_rep_id, route_sequence_order, dispatch_status, raw_address)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'assigned', a.raw_address
            FROM subscriptions s JOIN addresses a ON a.customer_id = s.customer_id
            JOIN sales_reps r ON r.id = ? AND r.is_admin = 1 AND COALESCE(r.is_active, 1) = 1
            WHERE s.id = ? AND s.status = 'active'`)
            .bind(plan.stopId, plan.subscriptionId, plan.historyId, plan.cycleId, plan.cycleDueDate, plan.cycleDueDate, plan.driverSalesRepId, plan.routeSequenceOrder, plan.driverSalesRepId, plan.subscriptionId),
    ]);

    const postflight = await preflightMbAugust31RouteRecovery(db, plan);
    if (postflight.outcome !== 'verified_noop') throw new Error('Recovery post-write verification failed; stop and use the precomputed inverse repair plan.');
    await assertExpectedFallbackIdentities(db, plan);
    return { outcome: 'fallback_applied', preflight, postflight };
}
