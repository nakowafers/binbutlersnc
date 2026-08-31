import { Subscription } from '@/lib/types';
import { CycleShadowSubscriptionResult, DueSubscriptionResult, ISubscriptionRepository } from '../types';

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

    async getPaymentFailureCycleSubscription(stripeSubscriptionId: string): Promise<{
        id: string;
        frequencyDays: number;
        serviceCycleAnchor: string | null;
        serviceDay: string | null;
    } | null> {
        return await this.db.prepare(`
            SELECT s.id, s.frequency_days AS frequencyDays, s.service_cycle_anchor AS serviceCycleAnchor, a.service_day AS serviceDay
            FROM subscriptions s
            JOIN customers c ON c.id = s.customer_id
            JOIN addresses a ON a.id = c.address_id
            WHERE s.stripe_subscription_id = ?
        `).bind(stripeSubscriptionId).first<{
            id: string;
            frequencyDays: number;
            serviceCycleAnchor: string | null;
            serviceDay: string | null;
        }>();
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

    async getDueSubscriptions(cycleDueDate: string, attemptServiceDate = cycleDueDate): Promise<DueSubscriptionResult[]> {
        const cycleDueDateStartIso = `${cycleDueDate}T00:00:00.000Z`;
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
              (s.status IN ('active', 'canceled', 'cancelled') AND s.current_period_end > ?)
              OR
              (s.status = 'one-time' AND sh_last.service_date IS NULL)
            )
            AND (
              (
                s.status = 'one-time'
                AND s.next_service_date IS NOT NULL
                AND s.next_service_date = ?
              )
              OR (
                s.status IN ('active', 'canceled', 'cancelled')
                AND (
                  (sh_last.service_date IS NULL AND s.next_service_date IS NOT NULL AND s.next_service_date = ?)
                  OR (
                    sh_last.service_date IS NULL
                    AND s.next_service_date IS NULL
                  )
                  OR (
                    sh_last.service_date IS NOT NULL
                    AND (julianday(?) - julianday(sh_last.service_date)) >= s.frequency_days
                  )
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
            .bind(cycleDueDateStartIso, cycleDueDate, cycleDueDate, cycleDueDate, attemptServiceDate)
            .all<DueSubscriptionResult>();
        return results || [];
    }

    async getCycleEligibleSubscriptions(cycleDueDate: string, attemptServiceDate = cycleDueDate): Promise<{
        dueSubscriptions: DueSubscriptionResult[];
        reviewSubscriptionIds: string[];
        recoveryReviewSuppressions: Array<{ subscriptionId: string; reason: string }>;
    }> {
        const cycleDueDateStartIso = `${cycleDueDate}T00:00:00.000Z`;
        // Dates here are canonical YYYY-MM-DD values. SQLite date arithmetic is used
        // deliberately so 28/56/84-day anniversaries never depend on timestamps.
        await this.db.batch([
            this.db.prepare(`
                INSERT OR IGNORE INTO service_cycles (id, subscription_id, cycle_due_date, state)
                SELECT 'service-cycle:' || s.id || ':' || ?, s.id, ?, 'open'
                FROM subscriptions s
                WHERE s.status IN ('active', 'canceled', 'cancelled')
                  AND s.current_period_end > ?
                  AND s.next_service_date IS NULL
                  AND s.frequency_days IN (28, 56, 84)
                  AND s.service_cycle_anchor IS NOT NULL
                  AND date(s.service_cycle_anchor, '+0 days') = s.service_cycle_anchor
                  AND s.service_cycle_anchor <= ?
                  AND CAST(julianday(?) - julianday(s.service_cycle_anchor) AS INTEGER) % s.frequency_days = 0
                  AND date(s.service_cycle_anchor, '+' || CAST(CAST(julianday(?) - julianday(s.service_cycle_anchor) AS INTEGER) AS TEXT) || ' days') = ?
                  AND NOT EXISTS (
                    SELECT 1 FROM subscription_recovery_reviews review
                    WHERE review.subscription_id = s.id AND review.classification = 'needs_review'
                  )
            `).bind(cycleDueDate, cycleDueDate, cycleDueDateStartIso, cycleDueDate, cycleDueDate, cycleDueDate, cycleDueDate),
            this.db.prepare(`
                INSERT OR IGNORE INTO service_cycles (id, subscription_id, cycle_due_date, state)
                SELECT 'service-cycle:' || s.id || ':' || ?, s.id, ?, 'open'
                FROM subscriptions s
                WHERE s.status = 'one-time'
                  AND s.frequency_days = 0
                  AND s.next_service_date = ?
                  AND NOT EXISTS (
                    SELECT 1 FROM subscription_recovery_reviews review
                    WHERE review.subscription_id = s.id AND review.classification = 'needs_review'
                  )
            `).bind(cycleDueDate, cycleDueDate, cycleDueDate),
            this.db.prepare(`
                INSERT OR IGNORE INTO service_cycle_events (
                    id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity,
                    occurred_at, reason, notes, correlation_key
                )
                SELECT 'service-cycle-created:' || sc.subscription_id || ':' || sc.cycle_due_date,
                       sc.id, 'created', NULL, 'open', 'daily-dispatch-cron', 'system', ?, NULL,
                       'dispatch_cutover_materialization', 'service-cycle-created:' || sc.subscription_id || ':' || sc.cycle_due_date
                FROM service_cycles sc
                WHERE sc.cycle_due_date = ?
                  AND NOT EXISTS (
                    SELECT 1 FROM service_cycle_events existing
                    WHERE existing.service_cycle_id = sc.id AND existing.event_type = 'created'
                  )
            `).bind(`${cycleDueDate}T00:00:00.000Z`, cycleDueDate),
        ]);

        const { results } = await this.db.prepare(`
            SELECT s.*, sc.id AS service_cycle_id, sc.cycle_due_date,
                   a.raw_address, a.latitude, a.longitude, a.service_day, a.notes, a.scent_preference,
                   c.email, c.first_name, c.last_name, c.name, c.phone_number, c.bin_quantity
            FROM service_cycles sc
            JOIN subscriptions s ON s.id = sc.subscription_id
            JOIN customers c ON s.customer_id = c.id
            JOIN addresses a ON c.address_id = a.id
            WHERE sc.cycle_due_date = ?
              AND sc.state = 'open'
              AND ((s.status IN ('active', 'canceled', 'cancelled') AND s.current_period_end > ?)
                   OR s.status = 'one-time')
              AND NOT EXISTS (
                  SELECT 1 FROM dispatch_stops ds WHERE ds.subscription_id = s.id AND ds.service_date = ?
              )
              AND NOT EXISTS (
                  SELECT 1 FROM subscription_recovery_reviews review
                  WHERE review.subscription_id = s.id AND review.classification = 'needs_review'
              )
        `).bind(cycleDueDate, cycleDueDateStartIso, attemptServiceDate).all<DueSubscriptionResult>();

        const reviewResult = await this.db.prepare(`
            SELECT s.id
            FROM subscriptions s
            WHERE s.status IN ('active', 'canceled', 'cancelled')
              AND s.current_period_end > ?
              AND s.frequency_days IN (28, 56, 84)
              AND s.next_service_date IS NULL
              AND (s.service_cycle_anchor IS NULL OR date(s.service_cycle_anchor) <> s.service_cycle_anchor)
              AND NOT EXISTS (
                  SELECT 1 FROM service_cycles sc
                  WHERE sc.subscription_id = s.id AND sc.cycle_due_date = ? AND sc.state = 'open'
              )
            ORDER BY s.id
        `).bind(cycleDueDateStartIso, cycleDueDate).all<{ id: string }>();
        const recoveryReviewResult = await this.db.prepare(`
            SELECT review.subscription_id, review.reason
            FROM subscription_recovery_reviews review
            JOIN subscriptions s ON s.id = review.subscription_id
            WHERE review.classification = 'needs_review'
              AND (
                EXISTS (
                    SELECT 1 FROM service_cycles sc
                    WHERE sc.subscription_id = s.id AND sc.cycle_due_date = ? AND sc.state = 'open'
                )
                OR (
                    s.status IN ('active', 'canceled', 'cancelled')
                    AND s.current_period_end > ?
                    AND s.next_service_date IS NULL
                    AND s.frequency_days IN (28, 56, 84)
                    AND s.service_cycle_anchor IS NOT NULL
                    AND date(s.service_cycle_anchor, '+0 days') = s.service_cycle_anchor
                    AND s.service_cycle_anchor <= ?
                    AND CAST(julianday(?) - julianday(s.service_cycle_anchor) AS INTEGER) % s.frequency_days = 0
                    AND date(s.service_cycle_anchor, '+' || CAST(CAST(julianday(?) - julianday(s.service_cycle_anchor) AS INTEGER) AS TEXT) || ' days') = ?
                )
                OR (s.status = 'one-time' AND s.frequency_days = 0 AND s.next_service_date = ?)
                OR (
                    s.status IN ('active', 'canceled', 'cancelled')
                    AND s.current_period_end > ?
                    AND s.frequency_days IN (28, 56, 84)
                    AND s.next_service_date IS NULL
                    AND (s.service_cycle_anchor IS NULL OR date(s.service_cycle_anchor) <> s.service_cycle_anchor)
                    AND NOT EXISTS (
                        SELECT 1 FROM service_cycles sc
                        WHERE sc.subscription_id = s.id AND sc.cycle_due_date = ? AND sc.state = 'open'
                    )
                )
              )
            ORDER BY review.subscription_id
        `).bind(
            cycleDueDate, cycleDueDateStartIso, cycleDueDate, cycleDueDate, cycleDueDate, cycleDueDate, cycleDueDate,
            cycleDueDateStartIso, cycleDueDate,
        ).all<{ subscription_id: string; reason: string }>();
        const recoveryReviewSuppressions = (recoveryReviewResult.results || []).map((row) => ({
            subscriptionId: row.subscription_id,
            reason: row.reason,
        }));
        return {
            dueSubscriptions: results || [],
            reviewSubscriptionIds: [...new Set([
                ...(reviewResult.results || []).map((row) => row.id),
                ...recoveryReviewSuppressions.map((suppression) => suppression.subscriptionId),
            ])].sort(),
            recoveryReviewSuppressions,
        };
    }

    async recordCycleException(input: {
        subscriptionId: string;
        cycleDueDate: string;
        reason: 'billing_delinquency' | 'vacation_pause';
        occurredAt: string;
        correlationKey: string;
    }): Promise<void> {
        const cycleId = `service-cycle:${input.subscriptionId}:${input.cycleDueDate}`;
        const createdKey = `service-cycle-created:${input.subscriptionId}:${input.cycleDueDate}`;
        await this.db.batch([
            this.db.prepare(
                "INSERT OR IGNORE INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES (?, ?, ?, 'open')"
            ).bind(cycleId, input.subscriptionId, input.cycleDueDate),
            this.db.prepare(
                `INSERT OR IGNORE INTO service_cycle_events (
                    id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity,
                    occurred_at, reason, notes, correlation_key
                 ) SELECT ?, sc.id, 'created', NULL, 'open', 'subscription-policy', 'system', ?, NULL, NULL, ?
                 FROM service_cycles sc
                 WHERE sc.subscription_id = ? AND sc.cycle_due_date = ?
                   AND NOT EXISTS (SELECT 1 FROM service_cycle_events existing WHERE existing.service_cycle_id = sc.id AND existing.event_type = 'created')`
            ).bind(createdKey, input.occurredAt, createdKey, input.subscriptionId, input.cycleDueDate),
            this.db.prepare(
                "UPDATE service_cycles SET state = 'exception', updated_at = ? WHERE subscription_id = ? AND cycle_due_date = ? AND state = 'open'"
            ).bind(input.occurredAt, input.subscriptionId, input.cycleDueDate),
            this.db.prepare(
                `INSERT OR IGNORE INTO service_cycle_events (
                    id, service_cycle_id, event_type, from_state, to_state, actor_id, actor_capacity,
                    occurred_at, reason, notes, correlation_key
                 ) SELECT ?, sc.id, 'transition', 'open', 'exception', 'subscription-policy', 'system', ?, ?, NULL, ?
                 FROM service_cycles sc
                 WHERE sc.subscription_id = ? AND sc.cycle_due_date = ? AND sc.state = 'exception'
                   AND (SELECT to_state FROM service_cycle_events WHERE service_cycle_id = sc.id ORDER BY rowid DESC LIMIT 1) = 'open'`
            ).bind(input.correlationKey, input.occurredAt, input.reason, input.correlationKey, input.subscriptionId, input.cycleDueDate),
        ]);
    }

    async getCycleShadowSubscriptions(): Promise<CycleShadowSubscriptionResult[]> {
        const { results } = await this.db.prepare(
            `SELECT s.id AS subscription_id, s.frequency_days, s.service_cycle_anchor, a.service_day,
                    GROUP_CONCAT(CASE WHEN sh.dispatch_status = 'Completed' THEN sh.service_date END) AS completed_service_dates
             FROM subscriptions s
             JOIN customers c ON c.id = s.customer_id
             JOIN addresses a ON a.id = c.address_id
             LEFT JOIN service_history sh ON sh.subscription_id = s.id
             WHERE s.status IN ('active', 'canceled', 'cancelled')
               AND s.is_paused = FALSE
               AND s.frequency_days IN (28, 56, 84)
             GROUP BY s.id, s.frequency_days, s.service_cycle_anchor, a.service_day
             ORDER BY s.id`
        ).all<{ subscription_id: string; frequency_days: number; service_cycle_anchor: string | null; service_day: string | null; completed_service_dates: string | null }>();
        return (results || []).map((row) => ({
            subscriptionId: row.subscription_id,
            frequencyDays: row.frequency_days,
            serviceCycleAnchor: row.service_cycle_anchor,
            serviceDay: row.service_day,
            completedServiceDates: row.completed_service_dates ? row.completed_service_dates.split(',') : [],
        }));
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

    async updateSubscriptionFirstServiceDate(id: string, firstServiceDate: string): Promise<void> {
        await this.db.prepare('UPDATE subscriptions SET next_service_date = ? WHERE id = ?')
            .bind(firstServiceDate, id)
            .run();
    }
}
