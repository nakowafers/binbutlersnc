import { createDatabase, createPaymentService } from '@/lib/backend/createServices';
import { IPaymentService } from '@/lib/payment/types';
import { Env } from '@/lib/types';
import { AdminCustomerService } from './AdminCustomerService';
import { AdminSettingsService } from './AdminSettingsService';

const noopPaymentService: IPaymentService = {
    async createCheckoutSession() {
        return { url: null };
    },
    async getCustomerIdByEmail() {
        return null;
    },
    async updateCustomerServiceDetails() {
        return;
    },
    async createBillingPortalSession() {
        return { url: '' };
    },
    async retrieveSubscriptionPeriodEnd() {
        return 0;
    },
    async retrieveCheckoutSession() {
        return { id: '', payment_status: '', customer_email: null, amount_total: null, customer: null };
    },
    async verifyWebhookEvent() {
        return {};
    },
};

export function createAdminCustomerService(env: Env): AdminCustomerService {
    const db = createDatabase(env);
    const stripeConfigured = !!env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.includes('sk_test_...');
    return new AdminCustomerService(db, stripeConfigured ? createPaymentService(env) : noopPaymentService, stripeConfigured);
}

export function createAdminSettingsService(env: Env): AdminSettingsService {
    return new AdminSettingsService(createDatabase(env));
}
