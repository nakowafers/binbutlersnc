import { ServiceHistory } from '@/lib/types';
import { IServiceHistoryRepository, PendingDispatchResult } from '../types';

export class D1ServiceHistoryRepositoryAdapter implements IServiceHistoryRepository {
    constructor(private readonly db: D1Database) {}

    async getServiceHistoryByCustomerId(customerId: string, limit: number = 5): Promise<ServiceHistory[]> {
        const { results } = await this.db.prepare(
            'SELECT sh.*, s.customer_id FROM service_history sh JOIN subscriptions s ON sh.subscription_id = s.id WHERE s.customer_id = ? ORDER BY sh.service_date DESC LIMIT ?'
        )
        .bind(customerId, limit)
        .all<ServiceHistory>();
        return results || [];
    }

    async getCompletedStopsCountLast7Days(): Promise<number> {
        const result = await this.db.prepare(
            "SELECT COUNT(*) as count FROM service_history WHERE dispatch_status = 'Completed' AND service_date >= datetime('now', '-7 days')"
        ).first<{ count: number }>();
        return result?.count || 0;
    }

    async getRecentActivity(limit: number = 5): Promise<Array<{ customer: string; status: string; time: string; address: string }>> {
        const { results } = await this.db.prepare(
            `SELECT 
                c.email as customer, 
                sh.dispatch_status as status, 
                sh.service_date as time, 
                a.raw_address as address 
             FROM service_history sh 
             JOIN subscriptions s ON sh.subscription_id = s.id
             JOIN customers c ON s.customer_id = c.id 
             JOIN addresses a ON c.address_id = a.id 
             ORDER BY sh.service_date DESC LIMIT ?`
        )
        .bind(limit)
        .all<{ customer: string; status: string; time: string; address: string }>();
        return results || [];
    }

    async updateServiceHistoryOnCompletion(subscriptionId: string, completedAt: string | null): Promise<void> {
        await this.db.prepare(
            `UPDATE service_history 
             SET dispatch_status = ?, service_date = COALESCE(?, service_date) 
             WHERE subscription_id = ? AND dispatch_status = 'Pending'`
        ).bind('Completed', completedAt, subscriptionId).run();
    }

    async updateServiceHistoryOnSkipped(subscriptionId: string, completedAt: string | null): Promise<void> {
        await this.db.prepare(
            `UPDATE service_history 
             SET dispatch_status = ?, service_date = COALESCE(?, service_date) 
             WHERE subscription_id = ? AND dispatch_status = 'Pending'`
        )
        .bind('Skipped', completedAt, subscriptionId)
        .run();
    }

    async logDispatchedJobs(
        historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string; binQuantity?: number }>,
        retryInserts: Array<{ id: string; subscriptionId: string; date: string; errorMsg: string }>,
        routificDispatches?: Array<{ id: string; subscriptionId: string; routificOrderId: string; serviceDate: string }>
    ): Promise<void> {
        const batchStatements = [];

        for (const item of historyInserts) {
            batchStatements.push(
                this.db.prepare(
                    'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, bin_quantity) VALUES (?, ?, ?, ?, ?)'
                ).bind(item.id, item.subscriptionId, item.date, item.status, item.binQuantity ?? null)
            );
        }

        for (const item of retryInserts) {
            batchStatements.push(
                this.db.prepare(
                    'INSERT INTO pending_dispatches (id, subscription_id, service_date, last_error) VALUES (?, ?, ?, ?)'
                ).bind(item.id, item.subscriptionId, item.date, item.errorMsg)
            );
        }

        if (routificDispatches) {
            for (const item of routificDispatches) {
                batchStatements.push(
                    this.db.prepare(
                        'INSERT INTO routific_dispatches (id, subscription_id, routific_order_id, service_date) VALUES (?, ?, ?, ?)'
                    ).bind(item.id, item.subscriptionId, item.routificOrderId, item.serviceDate)
                );
            }
        }

        if (batchStatements.length > 0) {
            for (let i = 0; i < batchStatements.length; i += 100) {
                await this.db.batch(batchStatements.slice(i, i + 100));
            }
        }
    }

    async deletePendingDispatchAndLogSuccess(id: string, historyId: string, subscriptionId: string, date: string, routificDispatchId?: string, routificOrderId?: string): Promise<void> {
        const statements = [
            this.db.prepare('DELETE FROM pending_dispatches WHERE id = ?').bind(id),
            this.db.prepare(
                'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES (?, ?, ?, ?)'
            ).bind(historyId, subscriptionId, date, 'Pending')
        ];
        if (routificDispatchId && routificOrderId) {
            statements.push(
                this.db.prepare(
                    'INSERT OR IGNORE INTO routific_dispatches (id, subscription_id, routific_order_id, service_date) VALUES (?, ?, ?, ?)'
                ).bind(routificDispatchId, subscriptionId, routificOrderId, date)
            );
        }
        await this.db.batch(statements);
    }

    async incrementPendingDispatchRetryCount(id: string, errorMsg: string): Promise<void> {
        await this.db.prepare(
            'UPDATE pending_dispatches SET retry_count = retry_count + 1, last_error = ? WHERE id = ?'
        )
        .bind(errorMsg, id)
        .run();
    }

    async getPendingDispatches(maxRetries: number): Promise<PendingDispatchResult[]> {
        const { results } = await this.db.prepare(
            `SELECT p.*, s.customer_id, a.raw_address, a.latitude, a.longitude
             FROM pending_dispatches p
             JOIN subscriptions s ON p.subscription_id = s.id
             JOIN customers c ON s.customer_id = c.id
             JOIN addresses a ON c.address_id = a.id
             WHERE p.retry_count < ? AND s.is_paused = FALSE`
        )
        .bind(maxRetries)
        .all<PendingDispatchResult>();
        return results || [];
    }

    async storeRoutificDispatch(id: string, subscriptionId: string, routificOrderId: string, serviceDate: string): Promise<void> {
        return this.storeRoutingDispatch(id, subscriptionId, routificOrderId, serviceDate);
    }

    async storeRoutingDispatch(id: string, subscriptionId: string, routingTargetId: string, serviceDate: string): Promise<void> {
        await this.db.prepare(
            'INSERT INTO routific_dispatches (id, subscription_id, routific_order_id, service_date) VALUES (?, ?, ?, ?)'
        ).bind(id, subscriptionId, routingTargetId, serviceDate).run();
    }

    async getRoutificOrderIdsBySubscription(subscriptionId: string): Promise<string[]> {
        return this.getRoutingTargetIdsBySubscription(subscriptionId);
    }

    async getRoutingTargetIdsBySubscription(subscriptionId: string): Promise<string[]> {
        const today = new Date().toISOString().split('T')[0];
        const result = await this.db.prepare(
            'SELECT routific_order_id FROM routific_dispatches WHERE subscription_id = ? AND service_date >= ?'
        ).bind(subscriptionId, today).all<{ routific_order_id: string }>();
        return result.results?.map(r => r.routific_order_id) || [];
    }

    async deleteRoutificDispatch(id: string): Promise<void> {
        return this.deleteRoutingDispatch(id);
    }

    async deleteRoutingDispatch(id: string): Promise<void> {
        await this.db.prepare(
            'DELETE FROM routific_dispatches WHERE id = ?'
        ).bind(id).run();
    }

    async cleanupFailedSubscriptionDispatches(subscriptionId: string, dateLimit: string): Promise<void> {
        return this.cleanupFailedSubscriptionRoutingDispatches(subscriptionId, dateLimit);
    }

    async cleanupFailedSubscriptionRoutingDispatches(subscriptionId: string, dateLimit: string): Promise<void> {
        await this.db.prepare(
            'DELETE FROM routific_dispatches WHERE subscription_id = ? AND service_date < ?'
        ).bind(subscriptionId, dateLimit).run();
    }
}
