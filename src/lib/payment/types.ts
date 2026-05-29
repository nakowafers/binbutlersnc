export interface CheckoutSessionParams {
    email: string;
    frequency: 'monthly' | 'quarterly' | 'one-time';
    binQuantity: number;
    phoneNumber: string;
    trashDay: string;
    providerName: string;
    salesRepId?: string;
    setup_fee_override?: number;
    tosAcceptedAt?: string | null;
    lat?: number;
    lng?: number;
    leadId: string;
    successUrl: string;
    cancelUrl: string;
}

export interface CustomerServiceDetails {
    address: string;
    trashDay: string;
    providerName?: string;
    phoneNumber?: string;
    lat?: number | null;
    lng?: number | null;
}

export interface IPaymentService {
    createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string | null }>;
    getCustomerIdByEmail(email: string): Promise<string | null>;
    updateCustomerServiceDetails(customerId: string, details: CustomerServiceDetails): Promise<void>;
    createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
    retrieveSubscriptionPeriodEnd(subscriptionId: string): Promise<number>;
    retrieveCheckoutSession(sessionId: string): Promise<{ id: string; payment_status: string; customer_email: string | null; amount_total: number | null }>;
    verifyWebhookEvent(body: string, signature: string, secret: string): Promise<unknown>;
}
