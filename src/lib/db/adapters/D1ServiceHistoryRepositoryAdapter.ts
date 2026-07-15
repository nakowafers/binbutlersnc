import { ServiceHistory } from '@/lib/types';
import { IServiceHistoryRepository } from '../types';

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
        retryInserts: Array<{ id: string; subscriptionId: string; date: string; errorMsg: string }>
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

        if (batchStatements.length > 0) {
            for (let i = 0; i < batchStatements.length; i += 100) {
                await this.db.batch(batchStatements.slice(i, i + 100));
            }
        }
    }

}
