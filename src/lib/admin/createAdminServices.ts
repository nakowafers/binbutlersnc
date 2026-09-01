import { createDatabase, createPaymentService } from '@/lib/backend/createServices';
import { IPaymentService } from '@/lib/payment/types';
import { Env } from '@/lib/types';
import { AdminCustomerService } from './AdminCustomerService';
import { AdminSettingsService } from './AdminSettingsService';
import { BinQuantityAdjustmentService } from './BinQuantityAdjustmentService';

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

export function createAdminCustomerService(env: Env, operatorId = 'admin'): AdminCustomerService {
    const db = createDatabase(env);
    const stripeConfigured = !!env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.includes('sk_test_...');
    const stripePaymentService = stripeConfigured ? createPaymentService(env) : null;
    const paymentService = stripePaymentService || noopPaymentService;
    const binQuantityService = stripePaymentService
        ? new BinQuantityAdjustmentService(db, stripePaymentService, operatorId)
        : undefined;
    return new AdminCustomerService(db, paymentService, stripeConfigured, binQuantityService);
}

export function createAdminSettingsService(env: Env): AdminSettingsService {
    return new AdminSettingsService(createDatabase(env));
}
