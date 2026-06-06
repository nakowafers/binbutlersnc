import { Lead, Customer, Address, Subscription, ServiceHistory } from '@/lib/types';
import { IDatabaseService, DueSubscriptionResult, PendingDispatchResult } from './types';

export class D1DatabaseAdapter implements IDatabaseService {
    private db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    async createLead(id: string, email: string, address: string, firstName: string, lastName: string, salesRepId: string | null, tosAcceptedAt: string | null): Promise<void> {
        await this.db.prepare(
            'INSERT INTO leads (id, email, address, first_name, last_name, sales_rep_id, tos_accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(id, email, address, firstName, lastName, salesRepId, tosAcceptedAt)
        .run();
    }

    async getLeadById(id: string): Promise<Lead | null> {
        return await this.db.prepare('SELECT * FROM leads WHERE id = ?')
            .bind(id)
            .first<Lead>();
    }

    async getLeadByEmail(email: string): Promise<Lead | null> {
        return await this.db.prepare('SELECT * FROM leads WHERE email = ? ORDER BY created_at DESC LIMIT 1')
            .bind(email)
            .first<Lead>();
    }

    async updateLeadMetadata(id: string, firstName: string, lastName: string, address: string, salesRepId: string | null, tosAcceptedAt: string | null): Promise<void> {
        await this.db.prepare(
            `UPDATE leads 
             SET first_name = ?, last_name = ?, address = ?, 
                 sales_rep_id = COALESCE(?, sales_rep_id), 
                 tos_accepted_at = COALESCE(?, tos_accepted_at) 
             WHERE id = ?`
        )
        .bind(firstName, lastName, address, salesRepId, tosAcceptedAt, id)
        .run();
    }

    async getCustomerByEmail(email: string): Promise<Customer | null> {
        return await this.db.prepare('SELECT * FROM customers WHERE email = ?')
            .bind(email)
            .first<Customer>();
    }

    async updateCustomerStripeId(customerId: string, stripeCustomerId: string): Promise<void> {
        await this.db.prepare('UPDATE customers SET stripe_customer_id = ? WHERE id = ?')
            .bind(stripeCustomerId, customerId)
            .run();
    }

    async updateCustomerAddressId(customerId: string, addressId: string): Promise<void> {
        await this.db.prepare('UPDATE customers SET address_id = ? WHERE id = ?')
            .bind(addressId, customerId)
            .run();
    }

    async getAddressById(id: string): Promise<Address | null> {
        return await this.db.prepare('SELECT * FROM addresses WHERE id = ?')
            .bind(id)
            .first<Address>();
    }

    async getAddressByRawAndCustomer(rawAddress: string, customerId: string): Promise<{ id: string } | null> {
        return await this.db.prepare('SELECT id FROM addresses WHERE raw_address = ? AND customer_id = ?')
            .bind(rawAddress, customerId)
            .first<{ id: string }>();
    }

    async updateAddressDetails(addressId: string, details: {
        serviceDay?: string;
        trashDay?: string;
    }): Promise<void> {
        await this.db.prepare(
            `UPDATE addresses 
             SET service_day = ?, trash_day = ?
             WHERE id = ?`
        )
        .bind(
            details.serviceDay ?? null,
            details.trashDay ?? null,
            addressId
        )
        .run();
    }

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

    async updateSubscriptionPauseStatus(id: string, isPaused: number): Promise<void> {
        await this.db.prepare('UPDATE subscriptions SET is_paused = ? WHERE id = ?')
            .bind(isPaused, id)
            .run();
    }

    async getSubscriptionIdByStripeId(stripeSubscriptionId: string): Promise<string | null> {
        const result = await this.db.prepare('SELECT id FROM subscriptions WHERE stripe_subscription_id = ?')
            .bind(stripeSubscriptionId)
            .first<{ id: string }>();
        return result?.id || null;
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

    async getServiceHistoryByCustomerId(customerId: string, limit: number = 5): Promise<ServiceHistory[]> {
        const { results } = await this.db.prepare(
            'SELECT sh.*, s.customer_id FROM service_history sh JOIN subscriptions s ON sh.subscription_id = s.id WHERE s.customer_id = ? ORDER BY sh.service_date DESC LIMIT ?'
        )
        .bind(customerId, limit)
        .all<ServiceHistory>();
        return results || [];
    }

    async getActiveSubscriptionsCount(): Promise<number> {
        const result = await this.db.prepare(
            "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'"
        ).first<{ count: number }>();
        return result?.count || 0;
    }

    async getCompletedStopsCountLast7Days(): Promise<number> {
        const result = await this.db.prepare(
            "SELECT COUNT(*) as count FROM service_history WHERE dispatch_status = 'Completed' AND service_date >= datetime('now', '-7 days')"
        ).first<{ count: number }>();
        return result?.count || 0;
    }

    async calculateEstimatedWeeklyRevenue(): Promise<number> {
        const result = await this.db.prepare(
            "SELECT SUM(CASE WHEN frequency_days = 28 THEN 7.50 WHEN frequency_days = 84 THEN 3.33 ELSE 0 END) as total_revenue FROM subscriptions WHERE status = 'active'"
        ).first<{ total_revenue: number }>();
        return result?.total_revenue || 0;
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

    async getGlobalSetting(key: string): Promise<string | null> {
        const result = await this.db.prepare("SELECT value FROM global_settings WHERE key = ?")
            .bind(key)
            .first<{ value: string }>();
        return result?.value || null;
    }

    async setGlobalSetting(key: string, value: string): Promise<void> {
        await this.db.prepare(
            'INSERT INTO global_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP'
        )
        .bind(key, value)
        .run();
    }

    async isSalesRepAllowedToOverrideFee(salesRepId: string): Promise<boolean> {
        const result = await this.db.prepare(
            'SELECT can_override_fee FROM sales_reps WHERE LOWER(id) = LOWER(?) AND can_override_fee = 1'
        ).bind(salesRepId).first<{ can_override_fee: number }>();
        return result !== null;
    }

    async convertLeadToCustomerTransaction(params: {
        leadId: string;
        email: string;
        firstName: string;
        lastName: string;
        stripeCustomerId: string;
        stripeSubscriptionId: string | null;
        phoneNumber: string;
        binQuantity: number;
        salesRepId: string | null;
        tosAcceptedAt: string | null;
        rawAddress: string;
        latitude: number | null;
        longitude: number | null;
        trashDay: string;
        serviceDay: string;
        notes: string;
        subscriptionId: string;
        addressId: string;
        customerId: string;
        currentPeriodEnd: string | null;
        serviceHistoryId: string;
        frequency: 'monthly' | 'quarterly' | 'one-time';
        nextServiceDate?: string | null;
        serviceHistoryStatus?: string;
    }): Promise<void> {
        const combinedName = `${params.firstName} ${params.lastName}`.trim();
        const batchStatements = [
            // 1. Remove converted lead
            this.db.prepare('DELETE FROM leads WHERE id = ?').bind(params.leadId),

            // 2. Create or update customer
            this.db.prepare(
                `INSERT INTO customers (id, email, first_name, last_name, name, stripe_customer_id, phone_number, bin_quantity, sales_rep_id, tos_accepted_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(email) DO UPDATE SET 
                    first_name = excluded.first_name,
                    last_name = excluded.last_name,
                    name = excluded.name,
                    stripe_customer_id = excluded.stripe_customer_id,
                    phone_number = excluded.phone_number,
                    bin_quantity = excluded.bin_quantity,
                    sales_rep_id = COALESCE(customers.sales_rep_id, excluded.sales_rep_id),
                    tos_accepted_at = COALESCE(customers.tos_accepted_at, excluded.tos_accepted_at)`
            ).bind(
                params.customerId,
                params.email,
                params.firstName,
                params.lastName,
                combinedName,
                params.stripeCustomerId,
                params.phoneNumber,
                params.binQuantity,
                params.salesRepId,
                params.tosAcceptedAt
            ),

            // 3. UPSERT address
            this.db.prepare(
                `INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day, notes) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(raw_address, customer_id) DO UPDATE SET
                    latitude = excluded.latitude,
                    longitude = excluded.longitude,
                    trash_day = excluded.trash_day,
                    service_day = excluded.service_day,
                    notes = excluded.notes`
            ).bind(
                params.addressId,
                params.customerId,
                params.rawAddress,
                params.latitude,
                params.longitude,
                params.trashDay,
                params.serviceDay,
                params.notes
            ),

            // 4. Update customer to link the address_id
            this.db.prepare('UPDATE customers SET address_id = ? WHERE id = ?')
                .bind(params.addressId, params.customerId),

            // 5. Create subscription or one-time record
            this.db.prepare(
                'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days, current_period_end, next_service_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(
                params.subscriptionId,
                params.customerId,
                params.stripeSubscriptionId,
                params.stripeSubscriptionId ? 'active' : 'one-time',
                params.frequency === 'monthly' ? 28 : params.frequency === 'quarterly' ? 84 : 0,
                params.currentPeriodEnd,
                params.nextServiceDate || null
            )
        ];

        // 6. Service history for scheduled first service (or immediate fulfillment)
        if (params.nextServiceDate) {
            // Next service date provided: same-day -> Completed, future -> Pending
            batchStatements.push(
                this.db.prepare(
                    'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, sales_rep_id) VALUES (?, ?, ?, ?, ?)'
                ).bind(
                    params.serviceHistoryId,
                    params.subscriptionId,
                    params.nextServiceDate,
                    params.serviceHistoryStatus || 'Pending',
                    params.salesRepId
                )
            );
        } else if (params.salesRepId) {
            // Fallback for D2D without next_service_date: immediate Completed (old behavior)
            batchStatements.push(
                this.db.prepare(
                    'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, sales_rep_id) VALUES (?, ?, ?, ?, ?)'
                ).bind(
                    params.serviceHistoryId,
                    params.subscriptionId,
                    new Date().toISOString(),
                    'Completed',
                    params.salesRepId
                )
            );
        }

        await this.db.batch(batchStatements);
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

    async getDueSubscriptions(nowIso: string): Promise<DueSubscriptionResult[]> {
        const query = `
            SELECT
                s.*,
                a.raw_address,
                a.latitude,
                a.longitude,
                a.service_day,
                c.email
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
              (s.status IN ('active', 'cancelled') AND s.is_paused = FALSE AND s.current_period_end > ?)
              OR
              (s.status = 'one-time' AND sh_last.service_date IS NULL)
            )
            AND (
              sh_last.service_date IS NULL
              OR (julianday(?) - julianday(sh_last.service_date)) >= s.frequency_days
            )
            AND NOT EXISTS (
              SELECT 1 FROM service_history sh 
              WHERE sh.subscription_id = s.id 
              AND sh.dispatch_status = 'Pending'
            )
        `;
        const { results } = await this.db.prepare(query)
            .bind(nowIso, nowIso)
            .all<DueSubscriptionResult>();
        return results || [];
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

    async logDispatchedJobs(
        historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string }>,
        retryInserts: Array<{ id: string; subscriptionId: string; date: string; errorMsg: string }>,
        routificDispatches?: Array<{ id: string; subscriptionId: string; routificOrderId: string; serviceDate: string }>
    ): Promise<void> {
        const batchStatements = [];

        for (const item of historyInserts) {
            batchStatements.push(
                this.db.prepare(
                    'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status) VALUES (?, ?, ?, ?)'
                ).bind(item.id, item.subscriptionId, item.date, item.status)
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
            // Cloudflare D1 has a batch size limit of 100
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

    async storeRoutificDispatch(id: string, subscriptionId: string, routificOrderId: string, serviceDate: string): Promise<void> {
        await this.db.prepare(
            'INSERT INTO routific_dispatches (id, subscription_id, routific_order_id, service_date) VALUES (?, ?, ?, ?)'
        ).bind(id, subscriptionId, routificOrderId, serviceDate).run();
    }

    async getRoutificOrderIdsBySubscription(subscriptionId: string): Promise<string[]> {
        const today = new Date().toISOString().split('T')[0];
        const result = await this.db.prepare(
            'SELECT routific_order_id FROM routific_dispatches WHERE subscription_id = ? AND service_date >= ?'
        ).bind(subscriptionId, today).all<{ routific_order_id: string }>();
        return result.results?.map(r => r.routific_order_id) || [];
    }

    async deleteRoutificDispatch(id: string): Promise<void> {
        await this.db.prepare(
            'DELETE FROM routific_dispatches WHERE id = ?'
        ).bind(id).run();
    }
}
