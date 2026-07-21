import { Address, Customer, CustomerWithDetails } from '@/lib/types';
import { ICustomerRepository } from '../types';

export class D1CustomerRepositoryAdapter implements ICustomerRepository {
    constructor(private readonly db: D1Database) {}

    async getCustomerById(id: string): Promise<Customer | null> {
        return await this.db.prepare('SELECT * FROM customers WHERE id = ?')
            .bind(id)
            .first<Customer>();
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

    async updateCustomer(customerId: string, details: {
        firstName?: string;
        lastName?: string;
        phoneNumber?: string;
    }): Promise<void> {
        const firstName = details.firstName ?? null;
        const lastName = details.lastName ?? null;
        const name = firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : null;
        const phoneNumber = details.phoneNumber ?? null;

        await this.db.prepare(
            `UPDATE customers SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), name = COALESCE(?, name), phone_number = COALESCE(?, phone_number) WHERE id = ?`
        )
        .bind(firstName, lastName, name, phoneNumber, customerId)
        .run();
    }

    async getStripeCustomerId(customerId: string): Promise<string | null> {
        const result = await this.db.prepare('SELECT stripe_customer_id FROM customers WHERE id = ?')
            .bind(customerId)
            .first<{ stripe_customer_id: string }>();
        return result?.stripe_customer_id || null;
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

    async updateAddress(addressId: string, details: {
        rawAddress?: string;
        latitude?: number | null;
        longitude?: number | null;
        trashDay?: string;
        notes?: string;
        scentPreference?: string;
    }): Promise<void> {
        await this.db.prepare(
            `UPDATE addresses 
             SET raw_address = COALESCE(?, raw_address),
                 latitude = COALESCE(?, latitude),
                 longitude = COALESCE(?, longitude),
                 trash_day = COALESCE(?, trash_day),
                 notes = COALESCE(?, notes),
                 scent_preference = COALESCE(?, scent_preference)
             WHERE id = ?`
        )
        .bind(
            details.rawAddress ?? null,
            details.latitude !== undefined ? details.latitude : null,
            details.longitude !== undefined ? details.longitude : null,
            details.trashDay ?? null,
            details.notes ?? null,
            details.scentPreference ?? null,
            addressId
        )
        .run();
    }

    async getAllCustomersWithDetails(): Promise<CustomerWithDetails[]> {
        const { results } = await this.db.prepare(
            `SELECT 
                c.id, c.email, c.first_name, c.last_name, c.phone_number,
                c.bin_quantity, c.sales_rep_id, c.created_at,
                a.id as address_id, a.raw_address, a.trash_day, a.service_day, a.notes, a.scent_preference,
                s.id as subscription_id, s.status as subscription_status,
                s.frequency_days, s.current_period_end, s.next_service_date, s.is_paused
             FROM customers c
             LEFT JOIN addresses a ON c.address_id = a.id
             LEFT JOIN subscriptions s ON s.customer_id = c.id
             ORDER BY c.created_at DESC`
        ).all<CustomerWithDetails>();
        return results || [];
    }

    async updateAddressNotes(addressId: string, notes: string): Promise<void> {
        await this.db.prepare('UPDATE addresses SET notes = ? WHERE id = ?')
            .bind(notes, addressId)
            .run();
    }

    async deleteCustomerCascade(customerId: string): Promise<void> {
        await this.db.batch([
            this.db.prepare('DELETE FROM dispatch_stops WHERE subscription_id IN (SELECT id FROM subscriptions WHERE customer_id = ?)').bind(customerId),
            this.db.prepare('DELETE FROM pending_dispatches WHERE subscription_id IN (SELECT id FROM subscriptions WHERE customer_id = ?)').bind(customerId),
            this.db.prepare('DELETE FROM service_history WHERE subscription_id IN (SELECT id FROM subscriptions WHERE customer_id = ?)').bind(customerId),
            this.db.prepare('DELETE FROM subscriptions WHERE customer_id = ?').bind(customerId),
            this.db.prepare('UPDATE customers SET address_id = NULL WHERE id = ?').bind(customerId),
            this.db.prepare('DELETE FROM addresses WHERE customer_id = ?').bind(customerId),
            this.db.prepare('DELETE FROM customers WHERE id = ?').bind(customerId),
        ]);
    }
}
