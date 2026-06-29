import { Lead } from '@/lib/types';
import { ILeadRepository } from '../types';

export class D1LeadRepositoryAdapter implements ILeadRepository {
    constructor(private readonly db: D1Database) {}

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
        scentPreference: string;
        subscriptionId: string;
        addressId: string;
        customerId: string;
        currentPeriodEnd: string | null;
        serviceHistoryId: string;
        frequency: 'monthly' | 'bimonthly' | 'quarterly' | 'one-time';
        nextServiceDate?: string | null;
        serviceHistoryStatus?: string;
    }): Promise<void> {
        const combinedName = `${params.firstName} ${params.lastName}`.trim();
        const batchStatements = [
            this.db.prepare('DELETE FROM leads WHERE id = ?').bind(params.leadId),
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
            this.db.prepare(
                `INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, trash_day, service_day, notes, scent_preference) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(raw_address, customer_id) DO UPDATE SET
                    latitude = excluded.latitude,
                    longitude = excluded.longitude,
                    trash_day = excluded.trash_day,
                    service_day = excluded.service_day,
                    notes = excluded.notes,
                    scent_preference = excluded.scent_preference`
            ).bind(
                params.addressId,
                params.customerId,
                params.rawAddress,
                params.latitude,
                params.longitude,
                params.trashDay,
                params.serviceDay,
                params.notes,
                params.scentPreference
            ),
            this.db.prepare('UPDATE customers SET address_id = ? WHERE id = ?')
                .bind(params.addressId, params.customerId),
            this.db.prepare(
                'INSERT INTO subscriptions (id, customer_id, stripe_subscription_id, status, frequency_days, current_period_end, next_service_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(
                params.subscriptionId,
                params.customerId,
                params.stripeSubscriptionId,
                params.stripeSubscriptionId ? 'active' : 'one-time',
                params.frequency === 'monthly' ? 28 : params.frequency === 'bimonthly' ? 56 : params.frequency === 'quarterly' ? 84 : 0,
                params.currentPeriodEnd,
                params.nextServiceDate || null
            )
        ];

        if (params.nextServiceDate) {
            batchStatements.push(
                this.db.prepare(
                    'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, sales_rep_id, bin_quantity) VALUES (?, ?, ?, ?, ?, ?)'
                ).bind(
                    params.serviceHistoryId,
                    params.subscriptionId,
                    params.nextServiceDate,
                    params.serviceHistoryStatus || 'Pending',
                    params.salesRepId,
                    params.binQuantity
                )
            );
        } else if (params.salesRepId) {
            batchStatements.push(
                this.db.prepare(
                    'INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, sales_rep_id, bin_quantity) VALUES (?, ?, ?, ?, ?, ?)'
                ).bind(
                    params.serviceHistoryId,
                    params.subscriptionId,
                    new Date().toISOString(),
                    'Completed',
                    params.salesRepId,
                    params.binQuantity
                )
            );
        }

        await this.db.batch(batchStatements);
    }

    async claimWebhookEvent(id: string, eventType: string): Promise<boolean> {
        const result = await this.db.prepare(
            'INSERT OR IGNORE INTO webhook_events (id, event_type) VALUES (?, ?)'
        ).bind(id, eventType).run();
        return result.meta.changes > 0;
    }

    async releaseWebhookEventClaim(id: string): Promise<void> {
        await this.db.prepare('DELETE FROM webhook_events WHERE id = ?').bind(id).run();
    }
}
