import { Subscription } from '@/lib/types';
import { DueSubscriptionResult, ISubscriptionRepository } from '../types';

export class D1SubscriptionRepositoryAdapter implements ISubscriptionRepository {
    constructor(private readonly db: D1Database) {}

    async getSubscriptionByCustomerId(customerId: string): Promise<Subscription | null> {
        return await this.db.prepare('SELECT * FROM subscriptions WHERE customer_id = ?')
            .bind(customerId)
            .first<Subscription>();
    }

    async getSubscriptionByIdAndCustomer(id: string, customerId: string): Promise<Subscription | null> {
        return await this.db.prepare('SELECT * FROM subscriptions WHERE id = ? AND customer_id = ?')
            .bind(id, customerId)
            .first<Subscription>();
    }

    async getSubscriptionIdByStripeId(stripeSubscriptionId: string): Promise<string | null> {
        const result = await this.db.prepare('SELECT id FROM subscriptions WHERE stripe_subscription_id = ?')
            .bind(stripeSubscriptionId)
            .first<{ id: string }>();
        return result?.id || null;
    }

    async updateSubscriptionPauseStatus(id: string, isPaused: number): Promise<void> {
        await this.db.prepare('UPDATE subscriptions SET is_paused = ? WHERE id = ?')
            .bind(isPaused, id)
            .run();
    }

    async updateSubscriptionStatus(stripeSubscriptionId: string, status: string, currentPeriodEnd: string | null): Promise<void> {
        if (currentPeriodEnd) {
            await this.db.prepare('UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?')
                .bind(status, currentPeriodEnd, stripeSubscriptionId)
                .run();
        } else {
            await this.db.prepare('UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?')
                .bind(status, stripeSubscriptionId)
                .run();
        }
    }

    async isSubscriptionPaused(id: string): Promise<boolean> {
        const result = await this.db.prepare('SELECT is_paused FROM subscriptions WHERE id = ?')
            .bind(id)
            .first<{ is_paused: boolean | number }>();
        return result?.is_paused === 1 || result?.is_paused === true;
    }

    async getDueSubscriptions(targetServiceDate: string): Promise<DueSubscriptionResult[]> {
        const targetServiceDateStartIso = `${targetServiceDate}T00:00:00.000Z`;
        const query = `
            SELECT
                s.*,
                a.raw_address,
                a.latitude,
                a.longitude,
                a.service_day,
                a.notes,
                a.scent_preference,
                c.email,
                c.first_name,
                c.last_name,
                c.name,
                c.phone_number,
                c.bin_quantity
            FROM subscriptions s
            JOIN customers c ON s.customer_id = c.id
            JOIN addresses a ON c.address_id = a.id
            LEFT JOIN (
                SELECT subscription_id, MAX(service_date) AS service_date
                FROM service_history
                WHERE dispatch_status = 'Completed'
                GROUP BY subscription_id
            ) sh_last ON sh_last.subscription_id = s.id
            WHERE (
              (s.status IN ('active', 'canceled', 'cancelled') AND s.is_paused = FALSE AND s.current_period_end > ?)
              OR
              (s.status = 'one-time' AND sh_last.service_date IS NULL)
            )
            AND (
              (sh_last.service_date IS NULL AND s.next_service_date IS NOT NULL AND s.next_service_date = ?)
              OR (
                sh_last.service_date IS NULL
                AND s.next_service_date IS NULL
              )
              OR (
                sh_last.service_date IS NOT NULL
                AND (
                  (julianday(?) - julianday(sh_last.service_date)) >= s.frequency_days
                )
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM dispatch_stops ds
              WHERE ds.subscription_id = s.id
              AND ds.service_date = ?
            )
        `;
        const { results } = await this.db.prepare(query)
            .bind(targetServiceDateStartIso, targetServiceDate, targetServiceDate, targetServiceDate)
            .all<DueSubscriptionResult>();
        return results || [];
    }

    async clearConsumedFirstServiceDates(subscriptionIds: string[], serviceDate: string): Promise<void> {
        if (subscriptionIds.length === 0) return;

        const placeholders = subscriptionIds.map(() => '?').join(', ');
        await this.db.prepare(
            `UPDATE subscriptions
             SET next_service_date = NULL
             WHERE next_service_date = ?
             AND id IN (${placeholders})`
        ).bind(serviceDate, ...subscriptionIds).run();
    }

    async getActiveSubscriptionsCount(): Promise<number> {
        const result = await this.db.prepare(
            "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'"
        ).first<{ count: number }>();
        return result?.count || 0;
    }

    async calculateEstimatedWeeklyRevenue(): Promise<number> {
        const result = await this.db.prepare(
            "SELECT SUM(CASE WHEN frequency_days = 28 THEN 7.50 WHEN frequency_days = 56 THEN 5.00 WHEN frequency_days = 84 THEN 3.33 ELSE 0 END) as total_revenue FROM subscriptions WHERE status = 'active'"
        ).first<{ total_revenue: number }>();
        return result?.total_revenue || 0;
    }

    async updateSubscriptionFirstServiceDate(id: string, firstServiceDate: string): Promise<void> {
        await this.db.prepare('UPDATE subscriptions SET next_service_date = ? WHERE id = ?')
            .bind(firstServiceDate, id)
            .run();
    }
}
