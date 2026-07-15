import { DispatchStop, SalesRep } from '@/lib/types';
import { DISPATCH_SETTING_KEYS, DISPATCH_SETTING_KEY_VALUES } from '@/lib/dispatch/settings';
import { CreateDispatchRouteInput, CreateDispatchStopInput, DispatchSetupStatus, IDispatchStopRepository } from '../types';

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

        const historyStatements = route.history.map((item) => this.db.prepare(
            'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, bin_quantity) VALUES (?, ?, ?, ?, ?)'
        ).bind(item.id, item.subscriptionId, item.date, item.status, item.binQuantity ?? null));

        const stopStatements = route.stops.map((stop) => this.db.prepare(
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

        await this.db.batch([...historyStatements, ...stopStatements]);
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
                     service_date = COALESCE(?, service_date)
                 WHERE id = ?`
            ).bind(completedAt, stop.service_history_id),
        ]);
    }

    async skipDispatchStop(id: string, updatedBySalesRepId: string, reason: string, skippedAt: string): Promise<void> {
        const stop = await this.getStopById(id);
        if (!stop || stop.dispatch_status !== 'assigned') return;

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
                     service_date = COALESCE(?, service_date)
                 WHERE id = ?`
            ).bind(skippedAt, stop.service_history_id),
        ]);
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
