import { getTodayDateString } from '../date-utils.ts';

export { getTodayDateString };

export interface OrphanPendingServiceHistoryAuditRow {
    service_history_id: string;
    service_history_service_date: string;
    service_history_status: string;
    service_history_created_at: string | null;
    subscription_id: string;
    subscription_status: string;
    subscription_paused: number;
    frequency_days: number;
    current_period_end: string | null;
    first_service_date: string | null;
    latest_completed_service_date: string | null;
    customer_id: string;
    customer_name: string | null;
    customer_email: string;
    customer_phone: string | null;
    bin_quantity: number | null;
    raw_address: string | null;
    service_day: string | null;
    trash_day: string | null;
    target_service_date: string;
    target_service_day: string;
    route_blocking: number;
}

export const ORPHAN_PENDING_AUDIT_REPORT_SQL = `
WITH latest_completed AS (
    SELECT subscription_id, MAX(service_date) AS latest_completed_service_date
    FROM service_history
    WHERE dispatch_status = 'Completed'
    GROUP BY subscription_id
),
orphan_pending AS (
    SELECT
        sh.id AS service_history_id,
        sh.service_date AS service_history_service_date,
        sh.dispatch_status AS service_history_status,
        sh.created_at AS service_history_created_at,
        s.id AS subscription_id,
        s.status AS subscription_status,
        COALESCE(s.is_paused, 0) AS subscription_paused,
        s.frequency_days,
        s.current_period_end,
        s.next_service_date AS first_service_date,
        lc.latest_completed_service_date,
        c.id AS customer_id,
        COALESCE(NULLIF(TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), c.name) AS customer_name,
        c.email AS customer_email,
        c.phone_number AS customer_phone,
        c.bin_quantity,
        a.raw_address,
        a.service_day,
        a.trash_day
    FROM service_history sh
    JOIN subscriptions s ON s.id = sh.subscription_id
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN addresses a ON a.id = c.address_id
    LEFT JOIN latest_completed lc ON lc.subscription_id = s.id
    LEFT JOIN dispatch_stops linked_stop ON linked_stop.service_history_id = sh.id
    WHERE sh.dispatch_status = 'Pending'
      AND linked_stop.id IS NULL
)
SELECT
    orphan_pending.*,
    ? AS target_service_date,
    ? AS target_service_day,
    CASE
        WHEN COALESCE(orphan_pending.subscription_paused, 0) = 0
         AND orphan_pending.service_day = ?
         AND NOT EXISTS (
            SELECT 1
            FROM dispatch_stops target_stop
            WHERE target_stop.subscription_id = orphan_pending.subscription_id
              AND target_stop.service_date = ?
         )
         AND (
            (
                orphan_pending.subscription_status IN ('active', 'canceled', 'cancelled')
                AND orphan_pending.current_period_end > ?
            )
            OR (
                orphan_pending.subscription_status = 'one-time'
                AND orphan_pending.latest_completed_service_date IS NULL
            )
         )
         AND (
            (
                orphan_pending.latest_completed_service_date IS NULL
                AND orphan_pending.first_service_date IS NOT NULL
                AND orphan_pending.first_service_date = ?
            )
            OR (
                orphan_pending.latest_completed_service_date IS NULL
                AND orphan_pending.first_service_date IS NULL
            )
            OR (
                orphan_pending.latest_completed_service_date IS NOT NULL
                AND (
                    (julianday(?) - julianday(orphan_pending.latest_completed_service_date)) >= orphan_pending.frequency_days
                )
            )
         )
        THEN 1
        ELSE 0
    END AS route_blocking
FROM orphan_pending
ORDER BY route_blocking DESC, service_day, service_history_service_date, customer_email
`;

export function getServiceDayForDate(date: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Invalid target service date "${date}". Expected YYYY-MM-DD.`);
    }

    const dayIndex = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    const serviceDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return serviceDays[dayIndex];
}

export function buildOrphanPendingAuditReportSql(targetServiceDate: string): string {
    const targetServiceDay = getServiceDayForDate(targetServiceDate);
    const targetServiceDateStartIso = `${targetServiceDate}T00:00:00.000Z`;
    const values = [
        targetServiceDate,
        targetServiceDay,
        targetServiceDay,
        targetServiceDate,
        targetServiceDateStartIso,
        targetServiceDate,
        targetServiceDate,
    ];

    let valueIndex = 0;
    return ORPHAN_PENDING_AUDIT_REPORT_SQL.replace(/\?/g, () => sqlQuote(values[valueIndex++]));
}

export async function getOrphanPendingServiceHistoryAuditReport(
    db: D1Database,
    targetServiceDate: string = getTodayDateString()
): Promise<OrphanPendingServiceHistoryAuditRow[]> {
    const targetServiceDay = getServiceDayForDate(targetServiceDate);
    const targetServiceDateStartIso = `${targetServiceDate}T00:00:00.000Z`;
    const { results } = await db.prepare(ORPHAN_PENDING_AUDIT_REPORT_SQL)
        .bind(
            targetServiceDate,
            targetServiceDay,
            targetServiceDay,
            targetServiceDate,
            targetServiceDateStartIso,
            targetServiceDate,
            targetServiceDate
        )
        .all<OrphanPendingServiceHistoryAuditRow>();
    return results || [];
}

function sqlQuote(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}
