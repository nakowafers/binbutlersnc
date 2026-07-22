import { describe, expect, it, beforeEach } from 'vitest';
import { DbSimulator } from '../integration/db-simulator';
import {
    buildOrphanPendingAuditReportSql,
    getOrphanPendingServiceHistoryAuditReport,
    getServiceDayForDate,
} from '../../src/lib/reports/orphanPendingServiceHistoryAudit';

describe('orphan pending Service History audit report', () => {
    let simulator: DbSimulator;

    beforeEach(() => {
        simulator = new DbSimulator();
    });

    it('lists only pending Service History rows without a corresponding Dispatch Stop', async () => {
        seedCustomerSubscription('blocking', { serviceDay: 'WED', nextServiceDate: '2026-07-22' });
        seedCustomerSubscription('linked', { serviceDay: 'WED', nextServiceDate: '2026-07-22' });
        seedCustomerSubscription('completed', { serviceDay: 'WED', nextServiceDate: null });

        insertHistory('orphan_pending', 'sub_blocking', '2026-06-24', 'Pending');
        insertHistory('linked_pending', 'sub_linked', '2026-07-22', 'Pending');
        insertDispatchStop('stop_linked', 'sub_linked', 'linked_pending', '2026-07-22');
        insertHistory('completed_history', 'sub_completed', '2026-06-24', 'Completed');

        const rows = await getOrphanPendingServiceHistoryAuditReport(simulator as any, '2026-07-22');

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            service_history_id: 'orphan_pending',
            service_history_service_date: '2026-06-24',
            service_history_status: 'Pending',
            subscription_id: 'sub_blocking',
            customer_id: 'cust_blocking',
            customer_name: 'Test blocking',
            customer_email: 'blocking@example.com',
            raw_address: 'blocking Main St',
            service_day: 'WED',
            first_service_date: '2026-07-22',
            target_service_date: '2026-07-22',
            target_service_day: 'WED',
        });
    });

    it('classifies target-date route-blocking orphan rows for first-service and recurring review', async () => {
        seedCustomerSubscription('first_due', { serviceDay: 'WED', nextServiceDate: '2026-07-22' });
        seedCustomerSubscription('first_overdue', { serviceDay: 'WED', nextServiceDate: '2026-06-24' });
        seedCustomerSubscription('recurring_due', { serviceDay: 'WED', nextServiceDate: null, frequencyDays: 28 });
        seedCustomerSubscription('recurring_due_with_stale_first_date', { serviceDay: 'WED', nextServiceDate: '2026-07-29', frequencyDays: 28 });
        seedCustomerSubscription('wrong_day', { serviceDay: 'THU', nextServiceDate: '2026-07-22' });
        seedCustomerSubscription('paused', { serviceDay: 'WED', nextServiceDate: '2026-07-22', isPaused: 1 });
        seedCustomerSubscription('already_routed', { serviceDay: 'WED', nextServiceDate: '2026-07-22' });

        insertHistory('orphan_first_due', 'sub_first_due', '2026-06-24', 'Pending');
        insertHistory('orphan_first_overdue', 'sub_first_overdue', '2026-06-24', 'Pending');
        insertHistory('orphan_recurring_due', 'sub_recurring_due', '2026-06-24', 'Pending');
        insertHistory('completed_recurring_due', 'sub_recurring_due', '2026-06-24', 'Completed');
        insertHistory('orphan_recurring_due_with_stale_first_date', 'sub_recurring_due_with_stale_first_date', '2026-06-24', 'Pending');
        insertHistory('completed_recurring_due_with_stale_first_date', 'sub_recurring_due_with_stale_first_date', '2026-06-24', 'Completed');
        insertHistory('orphan_wrong_day', 'sub_wrong_day', '2026-06-24', 'Pending');
        insertHistory('orphan_paused', 'sub_paused', '2026-06-24', 'Pending');
        insertHistory('orphan_already_routed', 'sub_already_routed', '2026-06-24', 'Pending');
        insertHistory('target_already_routed', 'sub_already_routed', '2026-07-22', 'Pending');
        insertDispatchStop('stop_already_routed', 'sub_already_routed', 'target_already_routed', '2026-07-22');

        const rows = await getOrphanPendingServiceHistoryAuditReport(simulator as any, '2026-07-22');
        const blockingByHistoryId = new Map(rows.map((row) => [row.service_history_id, row.route_blocking]));

        expect(blockingByHistoryId.get('orphan_first_due')).toBe(1);
        expect(blockingByHistoryId.get('orphan_first_overdue')).toBe(0);
        expect(blockingByHistoryId.get('orphan_recurring_due')).toBe(1);
        expect(blockingByHistoryId.get('orphan_recurring_due_with_stale_first_date')).toBe(1);
        expect(blockingByHistoryId.get('orphan_wrong_day')).toBe(0);
        expect(blockingByHistoryId.get('orphan_paused')).toBe(0);
        expect(blockingByHistoryId.get('orphan_already_routed')).toBe(0);
    });

    it('builds read-only SQL for remote D1 execution', () => {
        const sql = buildOrphanPendingAuditReportSql('2026-07-22');

        expect(sql).toContain("'2026-07-22' AS target_service_date");
        expect(sql).toContain("'WED' AS target_service_day");
        expect(sql).toMatch(/^\s*WITH /);
        expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i);
    });

    it('maps target dates to Service Day codes', () => {
        expect(getServiceDayForDate('2026-07-22')).toBe('WED');
        expect(() => getServiceDayForDate('07/22/2026')).toThrow('Expected YYYY-MM-DD');
    });

    function seedCustomerSubscription(id: string, options: {
        serviceDay: string;
        nextServiceDate: string | null;
        frequencyDays?: number;
        isPaused?: number;
        status?: string;
        currentPeriodEnd?: string;
    }) {
        simulator.db.prepare(
            'INSERT INTO customers (id, email, first_name, last_name, phone_number, bin_quantity) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(`cust_${id}`, `${id}@example.com`, 'Test', id, '(910) 555-0101', 2);
        simulator.db.prepare(
            'INSERT INTO addresses (id, customer_id, raw_address, trash_day, service_day, notes, scent_preference) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(`addr_${id}`, `cust_${id}`, `${id} Main St`, options.serviceDay, options.serviceDay, 'Gate code 1234', 'lavender');
        simulator.db.prepare('UPDATE customers SET address_id = ? WHERE id = ?').run(`addr_${id}`, `cust_${id}`);
        simulator.db.prepare(
            'INSERT INTO subscriptions (id, customer_id, status, frequency_days, current_period_end, next_service_date, is_paused) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
            `sub_${id}`,
            `cust_${id}`,
            options.status || 'active',
            options.frequencyDays ?? 28,
            options.currentPeriodEnd || '2026-08-01T00:00:00.000Z',
            options.nextServiceDate,
            options.isPaused ?? 0
        );
    }

    function insertHistory(id: string, subscriptionId: string, serviceDate: string, status: string) {
        simulator.db.prepare(
            'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES (?, ?, ?, ?)'
        ).run(id, subscriptionId, serviceDate, status);
    }

    function insertDispatchStop(id: string, subscriptionId: string, serviceHistoryId: string, serviceDate: string) {
        simulator.db.prepare(
            'INSERT INTO dispatch_stops (id, subscription_id, service_history_id, service_date, driver_sales_rep_id, route_sequence_order, customer_name, raw_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(id, subscriptionId, serviceHistoryId, serviceDate, 'DRIVER', 1, 'Dispatch Customer', 'Dispatch Main St');
    }
});
