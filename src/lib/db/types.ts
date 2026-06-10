import { Lead, Customer, Address, Subscription, ServiceHistory, CustomerWithDetails } from '@/lib/types';

export interface DueSubscriptionResult extends Subscription {
    raw_address: string;
    latitude: number | null;
    longitude: number | null;
    service_day: string;
    email: string;
    bin_quantity?: number;
}

export interface PendingDispatchResult {
    id: string;
    customer_id: string;
    subscription_id: string;
    service_date: string;
    retry_count: number;
    raw_address: string;
    latitude: number | null;
    longitude: number | null;
}

export interface IDatabaseService {
    // Lead Operations
    createLead(id: string, email: string, address: string, firstName: string, lastName: string, salesRepId: string | null, tosAcceptedAt: string | null): Promise<void>;
    getLeadById(id: string): Promise<Lead | null>;

    // Customer Operations
    getCustomerByEmail(email: string): Promise<Customer | null>;
    updateCustomerStripeId(customerId: string, stripeCustomerId: string): Promise<void>;
    updateCustomerAddressId(customerId: string, addressId: string): Promise<void>;

    // Address Operations
    getAddressById(id: string): Promise<Address | null>;
    getAddressByRawAndCustomer(rawAddress: string, customerId: string): Promise<{ id: string } | null>;
    updateAddressDetails(addressId: string, details: {
        serviceDay?: string;
        trashDay?: string;
    }): Promise<void>;

    // Subscription Operations
    getSubscriptionByCustomerId(customerId: string): Promise<Subscription | null>;
    getSubscriptionByIdAndCustomer(id: string, customerId: string): Promise<Subscription | null>;
    getSubscriptionIdByStripeId(stripeSubscriptionId: string): Promise<string | null>;
    updateSubscriptionPauseStatus(id: string, isPaused: number): Promise<void>;
    updateSubscriptionStatus(stripeSubscriptionId: string, status: string, currentPeriodEnd: string | null): Promise<void>;

    // Service History Operations
    getServiceHistoryByCustomerId(customerId: string, limit?: number): Promise<ServiceHistory[]>;

    // Admin Dashboard Queries
    getActiveSubscriptionsCount(): Promise<number>;
    getCompletedStopsCountLast7Days(): Promise<number>;
    calculateEstimatedWeeklyRevenue(): Promise<number>;
    getRecentActivity(limit?: number): Promise<Array<{ customer: string; status: string; time: string; address: string }>>;

    // Settings Operations
    getGlobalSetting(key: string): Promise<string | null>;
    setGlobalSetting(key: string, value: string): Promise<void>;

    // Sales Rep Authorization
    isSalesRepAllowedToOverrideFee(salesRepId: string): Promise<boolean>;

    // Webhook/Process transactions
    convertLeadToCustomerTransaction(params: {
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
    }): Promise<void>;

    updateServiceHistoryOnCompletion(subscriptionId: string, completedAt: string | null): Promise<void>;
    updateServiceHistoryOnSkipped(subscriptionId: string, completedAt: string | null): Promise<void>;

    // Workers / Dispatch Operations
    getDueSubscriptions(nowIso: string): Promise<DueSubscriptionResult[]>;
    getPendingDispatches(maxRetries: number): Promise<PendingDispatchResult[]>;
    logDispatchedJobs(
        historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string; binQuantity?: number }>,
        retryInserts: Array<{ id: string; subscriptionId: string; date: string; errorMsg: string }>,
        routificDispatches?: Array<{ id: string; subscriptionId: string; routificOrderId: string; serviceDate: string }>
    ): Promise<void>;
    deletePendingDispatchAndLogSuccess(id: string, historyId: string, subscriptionId: string, date: string, routificDispatchId?: string, routificOrderId?: string): Promise<void>;
    incrementPendingDispatchRetryCount(id: string, errorMsg: string): Promise<void>;

    // Routific Dispatch Tracking
    storeRoutificDispatch(id: string, subscriptionId: string, routificOrderId: string, serviceDate: string): Promise<void>;
    getRoutificOrderIdsBySubscription(subscriptionId: string): Promise<string[]>;
    deleteRoutificDispatch(id: string): Promise<void>;

    // Admin Customer Management
    getAllCustomersWithDetails(): Promise<CustomerWithDetails[]>;
    updateAddressNotes(addressId: string, notes: string): Promise<void>;
    deleteCustomerCascade(customerId: string): Promise<void>;
}
