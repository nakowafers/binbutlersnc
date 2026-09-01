export interface CheckoutSessionParams {
    email: string;
    firstName: string;
    lastName: string;
    frequency: 'monthly' | 'bimonthly' | 'quarterly' | 'one-time';
    binQuantity: number;
    phoneNumber: string;
    trashDay: string;
    notes: string;
    scentPreference: string;
    salesRepId?: string;
    setup_fee_override?: number;
    tosAcceptedAt?: string | null;
    nextServiceDate?: string;
    d2dServiceCompleted?: boolean;
    d2dServiceDate?: string;
    serviceCycleAnchor?: string;
    lat?: number;
    lng?: number;
    leadId: string;
    successUrl: string;
    cancelUrl: string;
}

export interface CustomerServiceDetails {
    name?: string;
    firstName?: string;
    lastName?: string;
    address: string;
    trashDay: string;
    notes?: string;
    scentPreference?: string;
    phoneNumber?: string;
    salesRepId?: string;
    lat?: number | null;
    lng?: number | null;
    nextServiceDate?: string | null;
    binQuantity?: string;
}

export type SupportedRecurringCadenceDays = 28 | 56 | 84;

export interface StripeBinQuantityAdjustmentState {
    customerId: string;
    subscriptionId: string;
    status: string;
    cadenceDays: SupportedRecurringCadenceDays;
    basePriceId: string;
    extraBinPriceId: string;
    extraBinSubscriptionItemId: string;
    extraBinQuantity: number;
    customerBinQuantity: number | null;
}

export interface StripeBinQuantityAdjustmentPaymentService {
    getBinQuantityAdjustmentState(customerId: string, subscriptionId: string): Promise<StripeBinQuantityAdjustmentState>;
    updateBinQuantityAdjustment(input: {
        customerId: string;
        subscriptionId: string;
        extraBinSubscriptionItemId: string;
        extraBinQuantity: number;
        binQuantity: number;
        idempotencyKey: string;
    }): Promise<StripeBinQuantityAdjustmentState>;
}

export interface IPaymentService {
    createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string | null }>;
    getCustomerIdByEmail(email: string): Promise<string | null>;
    updateCustomerServiceDetails(customerId: string, details: CustomerServiceDetails): Promise<void>;
    createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;
    retrieveSubscriptionPeriodEnd(subscriptionId: string): Promise<number>;
    getBillingDriftEvidence?(subscriptionId: string): Promise<import('@/lib/reports/billingDriftAudit').BillingDriftStripeEvidence | null>;
    retrieveCheckoutSession(sessionId: string): Promise<{ id: string; payment_status: string; customer_email: string | null; amount_total: number | null; customer: string | null }>;
    verifyWebhookEvent(body: string, signature: string, secret: string): Promise<unknown>;
}
