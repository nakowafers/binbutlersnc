import { DispatchStop, SalesRep } from '@/lib/types';
import { DISPATCH_SETTING_KEYS, DISPATCH_SETTING_KEY_VALUES } from '@/lib/dispatch/settings';
import { CreateDispatchRouteInput, CreateDispatchStopInput, DispatchSetupStatus, IDispatchStopRepository } from '../types';
import { actualServiceDate } from '@/lib/service-cycle/dates';
import { SERVICE_CYCLE_EXCEPTION_REASONS, ServiceCycleExceptionReason } from '@/lib/service-cycle/types';
import { asServiceCycleInvariantError } from '@/lib/service-cycle/invariants';

function parseNumberSetting(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export class D1DispatchStopRepositoryAdapter implements IDispatchStopRepository {
    constructor(private readonly db: D1Database) {}

    async createDispatchStops(stops: CreateDispatchStopInput[]): Promise<void> {
        await this.createDispatchRoute({ history: [], stops });
    }

    async createDispatchRoute(route: CreateDispatchRouteInput): Promise<void> {
        if (route.history.length === 0 && route.stops.length === 0) return;

        const cycleStatements = (route.cycles || []).flatMap((cycle) => [
            this.db.prepare(
                'INSERT OR IGNORE INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES (?, ?, ?, \'open\')'
            ).bind(cycle.id, cycle.subscriptionId, cycle.cycleDueDate),
            this.db.prepare(
                `INSERT OR IGNORE INTO service_cycle_events (
                    id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity,
                    occurred_at, reason, notes, correlation_key
                 ) SELECT ?, sc.id, 'created', NULL, 'open', 'daily-dispatch-cron', 'system', ?, NULL, 'shadow_dispatch', ?
                 FROM service_cycles sc
                 WHERE sc.subscription_id = ? AND sc.cycle_due_date = ?
                   AND NOT EXISTS (
                     SELECT 1 FROM service_cycle_events existing
                     WHERE existing.service_cycle_id = sc.id AND existing.event_type = 'created'
                   )`
            ).bind(cycle.eventId, cycle.occurredAt, cycle.correlationKey, cycle.subscriptionId, cycle.cycleDueDate),
        ]);

        const historyStatements = route.history.map((item) => item.serviceCycleId && item.cycleDueDate
            ? this.db.prepare(
                `INSERT OR IGNORE INTO service_history (
                    id, subscription_id, service_cycle_id, cycle_due_date, service_date, dispatch_status, bin_quantity, completed_at
                 ) SELECT ?, ?, sc.id, ?, ?, ?, ?, NULL
                 FROM service_cycles sc
                 WHERE sc.subscription_id = ? AND sc.cycle_due_date = ?
                   AND NOT EXISTS (
                     SELECT 1 FROM dispatch_stops existing
                     WHERE existing.subscription_id = ? AND existing.service_date = ?
                   )`
            ).bind(item.id, item.subscriptionId, item.cycleDueDate, item.date, item.status, item.binQuantity ?? null, item.subscriptionId, item.cycleDueDate, item.subscriptionId, item.date)
            : this.db.prepare(
                'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, bin_quantity) VALUES (?, ?, ?, ?, ?)'
            ).bind(item.id, item.subscriptionId, item.date, item.status, item.binQuantity ?? null));

        const stopStatements = route.stops.map((stop) => stop.serviceCycleId && stop.cycleDueDate
            ? this.db.prepare(
                `INSERT INTO dispatch_stops (
                    id, subscription_id, service_history_id, service_cycle_id, cycle_due_date, service_date, driver_sales_rep_id,
                    route_sequence_order, dispatch_status, customer_name, raw_address, latitude, longitude, bin_count,
                    customer_scent, service_notes, customer_phone
                 ) SELECT ?, ?, ?, sc.id, ?, ?, ?, ?, 'assigned', ?, ?, ?, ?, ?, ?, ?, ?
                 FROM service_cycles sc
                 WHERE sc.subscription_id = ? AND sc.cycle_due_date = ?
                 ON CONFLICT(subscription_id, service_date) DO UPDATE SET
                    service_history_id = excluded.service_history_id,
                    service_cycle_id = excluded.service_cycle_id,
                    cycle_due_date = excluded.cycle_due_date,
                    driver_sales_rep_id = excluded.driver_sales_rep_id,
                    route_sequence_order = excluded.route_sequence_order,
                    customer_name = excluded.customer_name,
                    raw_address = excluded.raw_address,
                    latitude = excluded.latitude,
                    longitude = excluded.longitude,
                    bin_count = excluded.bin_count,
                    customer_scent = excluded.customer_scent,
                    service_notes = excluded.service_notes,
                    customer_phone = excluded.customer_phone,
                    updated_at = datetime('now')`
            ).bind(
                stop.id, stop.subscriptionId, stop.serviceHistoryId, stop.cycleDueDate, stop.serviceDate,
                stop.driverSalesRepId, stop.routeSequenceOrder, stop.customerName, stop.rawAddress, stop.latitude,
                stop.longitude, stop.binCount, stop.customerScent, stop.serviceNotes, stop.customerPhone,
                stop.subscriptionId, stop.cycleDueDate
            )
            : this.db.prepare(
            `INSERT INTO dispatch_stops (
                id, subscription_id, service_history_id, service_date, driver_sales_rep_id,
                route_sequence_order, dispatch_status, customer_name, raw_address, latitude,
                longitude, bin_count, customer_scent, service_notes, customer_phone
             ) VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(subscription_id, service_date) DO UPDATE SET
                service_history_id = excluded.service_history_id,
                driver_sales_rep_id = excluded.driver_sales_rep_id,
                route_sequence_order = excluded.route_sequence_order,
                customer_name = excluded.customer_name,
                raw_address = excluded.raw_address,
                latitude = excluded.latitude,
                longitude = excluded.longitude,
                bin_count = excluded.bin_count,
                customer_scent = excluded.customer_scent,
                service_notes = excluded.service_notes,
                customer_phone = excluded.customer_phone,
                updated_at = datetime('now')`
        ).bind(
            stop.id,
            stop.subscriptionId,
            stop.serviceHistoryId,
            stop.serviceDate,
            stop.driverSalesRepId,
            stop.routeSequenceOrder,
            stop.customerName,
            stop.rawAddress,
            stop.latitude,
            stop.longitude,
            stop.binCount,
            stop.customerScent,
            stop.serviceNotes,
            stop.customerPhone
        ));

        const consumedFirstService = route.consumedFirstService;
        const clearConsumedFirstServiceStatements = consumedFirstService && consumedFirstService.subscriptionIds.length > 0
            ? [
                this.db.prepare(
                    `UPDATE subscriptions
                     SET next_service_date = NULL
                     WHERE next_service_date = ?
                     AND id IN (${consumedFirstService.subscriptionIds.map(() => '?').join(', ')})`
                ).bind(consumedFirstService.serviceDate, ...consumedFirstService.subscriptionIds),
            ]
            : [];

        try {
            await this.db.batch([...cycleStatements, ...historyStatements, ...stopStatements, ...clearConsumedFirstServiceStatements]);
        } catch (error) {
            throw asServiceCycleInvariantError(error, 'route creation');
        }
    }

    async getRouteStops(driverSalesRepId: string, serviceDate: string, includeTerminal = false): Promise<DispatchStop[]> {
        const terminalClause = includeTerminal ? '' : "AND dispatch_status = 'assigned'";
        const { results } = await this.db.prepare(
            `SELECT * FROM dispatch_stops
             WHERE driver_sales_rep_id = ? AND service_date = ? ${terminalClause}
             ORDER BY route_sequence_order ASC, created_at ASC`
        ).bind(driverSalesRepId, serviceDate).all<DispatchStop>();
        return results || [];
    }

    async getStopById(id: string): Promise<DispatchStop | null> {
        return await this.db.prepare('SELECT * FROM dispatch_stops WHERE id = ?')
            .bind(id)
            .first<DispatchStop>();
    }

    async markDispatchStopCompleted(id: string, updatedBySalesRepId: string, completedAt: string): Promise<void> {
        const stop = await this.getStopById(id);
        if (!stop || stop.dispatch_status !== 'assigned') return;

        if (!stop.service_cycle_id) {
            await this.db.batch([
                this.db.prepare(
                    `UPDATE dispatch_stops
                     SET dispatch_status = 'completed',
                         completed_at = ?,
                         updated_by_sales_rep_id = ?,
                         updated_at = datetime('now')
                     WHERE id = ?`
                ).bind(completedAt, updatedBySalesRepId, id),
                this.db.prepare(
                    `UPDATE service_history
                     SET dispatch_status = 'Completed',
                         service_date = ?
                     WHERE id = ?`
                ).bind(stop.service_date, stop.service_history_id),
            ]);
            return;
        }

        const cycle = await this.db.prepare('SELECT state FROM service_cycles WHERE id = ?').bind(stop.service_cycle_id)
            .first<{ state: 'open' | 'exception' | 'fulfilled' | 'waived' }>();
        if (!cycle) throw new Error(`Linked Service Cycle ${stop.service_cycle_id} was not found`);
        if (cycle.state === 'fulfilled' || cycle.state === 'waived') {
            throw new Error(`Service Cycle ${stop.service_cycle_id} is terminal and cannot be completed again`);
        }
        const serviceDate = actualServiceDate(new Date(completedAt));

        try {
            await this.db.batch([
            this.db.prepare(
                `UPDATE dispatch_stops
                 SET dispatch_status = 'completed',
                     completed_at = ?,
                     updated_by_sales_rep_id = ?,
                     updated_at = datetime('now')
                 WHERE id = ? AND dispatch_status = 'assigned'`
            ).bind(completedAt, updatedBySalesRepId, id),
            this.db.prepare(
                `UPDATE service_history
                 SET dispatch_status = 'Completed',
                     service_date = ?,
                     completed_at = ?
                 WHERE id = ? AND dispatch_status = 'Pending'`
            ).bind(serviceDate, completedAt, stop.service_history_id),
            this.db.prepare(
                'UPDATE service_cycles SET state = ?, updated_at = ? WHERE id = ? AND state = ?'
            ).bind('fulfilled', completedAt, stop.service_cycle_id, cycle.state),
            this.db.prepare(
                `INSERT INTO service_cycle_events (
                    id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity,
                    occurred_at, reason, notes, correlation_key
                 ) VALUES (?, ?, 'transition', ?, 'fulfilled', ?, 'fulfillment', ?, NULL, NULL, ?)`
            ).bind(`dispatch-completed:${id}`, stop.service_cycle_id, cycle.state, updatedBySalesRepId, completedAt, `dispatch-completed:${id}`),
            ]);
        } catch (error) {
            throw asServiceCycleInvariantError(error, 'cycle completion');
        }
    }

    async skipDispatchStop(id: string, updatedBySalesRepId: string, reason: string, skippedAt: string, notes?: string): Promise<void> {
        const stop = await this.getStopById(id);
        if (!stop || stop.dispatch_status !== 'assigned') return;

        if (!stop.service_cycle_id) {
            await this.db.batch([
                this.db.prepare(
                    `UPDATE dispatch_stops
                     SET dispatch_status = 'skipped',
                         skip_reason = ?,
                         updated_by_sales_rep_id = ?,
                         updated_at = datetime('now')
                     WHERE id = ?`
                ).bind(reason, updatedBySalesRepId, id),
                this.db.prepare(
                    `UPDATE service_history
                     SET dispatch_status = 'Skipped',
                         service_date = ?
                     WHERE id = ?`
                ).bind(stop.service_date, stop.service_history_id),
            ]);
            return;
        }

        if (!SERVICE_CYCLE_EXCEPTION_REASONS.includes(reason as ServiceCycleExceptionReason)) {
            throw new Error('A controlled Service Cycle exception reason is required');
        }
        if (reason === 'other' && !notes?.trim()) throw new Error('Notes are required for other Service Cycle exceptions');
        const cycle = await this.db.prepare('SELECT state FROM service_cycles WHERE id = ?').bind(stop.service_cycle_id)
            .first<{ state: 'open' | 'exception' | 'fulfilled' | 'waived' }>();
        if (!cycle) throw new Error(`Linked Service Cycle ${stop.service_cycle_id} was not found`);
        if (cycle.state !== 'open') throw new Error(`Service Cycle ${stop.service_cycle_id} cannot be skipped from ${cycle.state}`);

        try {
            await this.db.batch([
            this.db.prepare(
                `UPDATE dispatch_stops
                 SET dispatch_status = 'skipped',
                     skip_reason = ?,
                     updated_by_sales_rep_id = ?,
                     updated_at = datetime('now')
                 WHERE id = ? AND dispatch_status = 'assigned'`
            ).bind(reason, updatedBySalesRepId, id),
            this.db.prepare(
                `UPDATE service_history
                 SET dispatch_status = 'Skipped',
                     service_date = ?
                 WHERE id = ? AND dispatch_status = 'Pending'`
            ).bind(stop.service_date, stop.service_history_id),
            this.db.prepare('UPDATE service_cycles SET state = ?, updated_at = ? WHERE id = ? AND state = ?')
                .bind('exception', skippedAt, stop.service_cycle_id, cycle.state),
            this.db.prepare(
                `INSERT INTO service_cycle_events (
                    id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity,
                    occurred_at, reason, notes, correlation_key
                 ) VALUES (?, ?, 'transition', ?, 'exception', ?, 'fulfillment', ?, ?, ?, ?)`
            ).bind(`dispatch-skipped:${id}`, stop.service_cycle_id, cycle.state, updatedBySalesRepId, skippedAt, reason, notes?.trim() || null, `dispatch-skipped:${id}`),
            ]);
        } catch (error) {
            throw asServiceCycleInvariantError(error, 'cycle skip');
        }
    }

    async getActiveAdminDrivers(): Promise<SalesRep[]> {
        const { results } = await this.db.prepare(
            `SELECT * FROM sales_reps
             WHERE is_admin = 1 AND COALESCE(is_active, 1) = 1
             ORDER BY id ASC`
        ).all<SalesRep>();
        return results || [];
    }

    async getAdminDriverByEmail(email: string): Promise<SalesRep | null> {
        return await this.db.prepare(
            `SELECT * FROM sales_reps
             WHERE LOWER(email) = LOWER(?) AND is_admin = 1 AND COALESCE(is_active, 1) = 1`
        ).bind(email).first<SalesRep>();
    }

    async getDispatchSetupStatus(): Promise<DispatchSetupStatus> {
        const rows = await this.db.prepare(
            `SELECT key, value FROM global_settings
             WHERE key IN (${DISPATCH_SETTING_KEY_VALUES.map(() => '?').join(', ')})`
        ).bind(...DISPATCH_SETTING_KEY_VALUES).all<{ key: string; value: string }>();
        const settings = new Map((rows.results || []).map((row) => [row.key, row.value]));
        const defaultDriverId = settings.get(DISPATCH_SETTING_KEYS.defaultDriverSalesRepId) || null;
        const depotAddress = settings.get(DISPATCH_SETTING_KEYS.routeDepotAddress) || null;
        const depotLat = parseNumberSetting(settings.get(DISPATCH_SETTING_KEYS.routeDepotLat) || null);
        const depotLng = parseNumberSetting(settings.get(DISPATCH_SETTING_KEYS.routeDepotLng) || null);
        const missing = [];
        if (!defaultDriverId) missing.push(DISPATCH_SETTING_KEYS.defaultDriverSalesRepId);
        if (!depotAddress) missing.push(DISPATCH_SETTING_KEYS.routeDepotAddress);
        if (depotLat === null) missing.push(DISPATCH_SETTING_KEYS.routeDepotLat);
        if (depotLng === null) missing.push(DISPATCH_SETTING_KEYS.routeDepotLng);

        return {
            defaultDriverId,
            depotAddress,
            depotLat,
            depotLng,
            isConfigured: missing.length === 0,
            missing,
        };
    }

    async updateAddressCoordinates(address: string, latitude: number, longitude: number): Promise<void> {
        await this.db.prepare(
            `UPDATE addresses
             SET latitude = COALESCE(latitude, ?),
                 longitude = COALESCE(longitude, ?)
             WHERE raw_address = ?`
        ).bind(latitude, longitude, address).run();
    }
}
