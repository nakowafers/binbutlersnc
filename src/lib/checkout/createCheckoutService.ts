import { createDatabase, createPaymentService } from '@/lib/backend/createServices';
import { CheckoutSessionParams, CustomerServiceDetails, IPaymentService } from '@/lib/payment/types';
import { Env } from '@/lib/types';
import { CheckoutService } from './CheckoutService';

export function createCheckoutService(env: Env): CheckoutService {
    const db = env.DB ? createDatabase(env) : null;
    return new CheckoutService(env, db, db, new LazyCheckoutPaymentService(env));
}

class LazyCheckoutPaymentService implements IPaymentService {
    constructor(private readonly env: Env) {}

    createCheckoutSession(params: CheckoutSessionParams) {
        return createPaymentService(this.env).createCheckoutSession(params);
    }

    getCustomerIdByEmail(email: string) {
        return createPaymentService(this.env).getCustomerIdByEmail(email);
    }

    updateCustomerServiceDetails(customerId: string, details: CustomerServiceDetails) {
        return createPaymentService(this.env).updateCustomerServiceDetails(customerId, details);
    }

    createBillingPortalSession(customerId: string, returnUrl: string) {
        return createPaymentService(this.env).createBillingPortalSession(customerId, returnUrl);
    }

    retrieveSubscriptionPeriodEnd(subscriptionId: string) {
        return createPaymentService(this.env).retrieveSubscriptionPeriodEnd(subscriptionId);
    }

    retrieveCheckoutSession(sessionId: string) {
        return createPaymentService(this.env).retrieveCheckoutSession(sessionId);
    }

    verifyWebhookEvent(body: string, signature: string, secret: string) {
        return createPaymentService(this.env).verifyWebhookEvent(body, signature, secret);
    }
}
