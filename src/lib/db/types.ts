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

// 1. Lead Operations & Transactions
export interface ILeadRepository {
    createLead(id: string, email: string, address: string, firstName: string, lastName: string, salesRepId: string | null, tosAcceptedAt: string | null): Promise<void>;
    getLeadById(id: string): Promise<Lead | null>;
    getLeadByEmail(email: string): Promise<Lead | null>;
    updateLeadMetadata(id: string, firstName: string, lastName: string, address: string, salesRepId: string | null, tosAcceptedAt: string | null): Promise<void>;
    
    // Cross-cutting transition transaction
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
        scentPreference: string;
        subscriptionId: string;
        addressId: string;
        customerId: string;
        currentPeriodEnd: string | null;
        serviceHistoryId: string;
        frequency: 'monthly' | 'bimonthly' | 'quarterly' | 'one-time';
        nextServiceDate?: string | null;
        serviceHistoryStatus?: string;
    }): Promise<void>;

    claimWebhookEvent(id: string, eventType: string): Promise<boolean>;
    releaseWebhookEventClaim(id: string): Promise<void>;
}

// 2. Customer & Address Operations
export interface ICustomerRepository {
    getCustomerById(id: string): Promise<Customer | null>;
    getCustomerByEmail(email: string): Promise<Customer | null>;
    updateCustomerStripeId(customerId: string, stripeCustomerId: string): Promise<void>;
    updateCustomerAddressId(customerId: string, addressId: string): Promise<void>;
    updateCustomer(customerId: string, details: {
        firstName?: string;
        lastName?: string;
        phoneNumber?: string;
    }): Promise<void>;
    getStripeCustomerId(customerId: string): Promise<string | null>;

    getAddressById(id: string): Promise<Address | null>;
    getAddressByRawAndCustomer(rawAddress: string, customerId: string): Promise<{ id: string } | null>;
    updateAddressDetails(addressId: string, details: {
        serviceDay?: string;
        trashDay?: string;
    }): Promise<void>;
    updateAddress(addressId: string, details: {
        rawAddress?: string;
        latitude?: number | null;
        longitude?: number | null;
        trashDay?: string;
        notes?: string;
        scentPreference?: string;
    }): Promise<void>;

    getAllCustomersWithDetails(): Promise<CustomerWithDetails[]>;
    updateAddressNotes(addressId: string, notes: string): Promise<void>;
    deleteCustomerCascade(customerId: string): Promise<void>;
}

// 3. Subscription & Interval Operations
export interface ISubscriptionRepository {
    getSubscriptionByCustomerId(customerId: string): Promise<Subscription | null>;
    getSubscriptionByIdAndCustomer(id: string, customerId: string): Promise<Subscription | null>;
    getSubscriptionIdByStripeId(stripeSubscriptionId: string): Promise<string | null>;
    updateSubscriptionPauseStatus(id: string, isPaused: number): Promise<void>;
    updateSubscriptionStatus(stripeSubscriptionId: string, status: string, currentPeriodEnd: string | null): Promise<void>;
    isSubscriptionPaused(id: string): Promise<boolean>;
    getDueSubscriptions(nowIso: string): Promise<DueSubscriptionResult[]>;
    getActiveSubscriptionsCount(): Promise<number>;
    calculateEstimatedWeeklyRevenue(): Promise<number>;
}

// 4. Fulfillment & Service History Operations
export interface IServiceHistoryRepository {
    getServiceHistoryByCustomerId(customerId: string, limit?: number): Promise<ServiceHistory[]>;
    getCompletedStopsCountLast7Days(): Promise<number>;
    getRecentActivity(limit?: number): Promise<Array<{ customer: string; status: string; time: string; address: string }>>;
    
    updateServiceHistoryOnCompletion(subscriptionId: string, completedAt: string | null): Promise<void>;
    updateServiceHistoryOnSkipped(subscriptionId: string, completedAt: string | null): Promise<void>;
    
    logDispatchedJobs(
        historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string; binQuantity?: number }>,
        retryInserts: Array<{ id: string; subscriptionId: string; date: string; errorMsg: string }>,
        routificDispatches?: Array<{ id: string; subscriptionId: string; routificOrderId: string; serviceDate: string }>
    ): Promise<void>;
    
    deletePendingDispatchAndLogSuccess(id: string, historyId: string, subscriptionId: string, date: string, routificDispatchId?: string, routificOrderId?: string): Promise<void>;
    incrementPendingDispatchRetryCount(id: string, errorMsg: string): Promise<void>;
    getPendingDispatches(maxRetries: number): Promise<PendingDispatchResult[]>;

    storeRoutificDispatch(id: string, subscriptionId: string, routificOrderId: string, serviceDate: string): Promise<void>;
    getRoutificOrderIdsBySubscription(subscriptionId: string): Promise<string[]>;
    deleteRoutificDispatch(id: string): Promise<void>;
    cleanupFailedSubscriptionDispatches(subscriptionId: string, dateLimit: string): Promise<void>;
    storeRoutingDispatch(id: string, subscriptionId: string, routingTargetId: string, serviceDate: string): Promise<void>;
    getRoutingTargetIdsBySubscription(subscriptionId: string): Promise<string[]>;
    deleteRoutingDispatch(id: string): Promise<void>;
    cleanupFailedSubscriptionRoutingDispatches(subscriptionId: string, dateLimit: string): Promise<void>;
}

// 5. Global Settings Operations
export interface ISettingsRepository {
    getGlobalSetting(key: string): Promise<string | null>;
    setGlobalSetting(key: string, value: string): Promise<void>;
    acquireLock(key: string, value: string, expireThreshold: number): Promise<boolean>;
}

// 6. Sales Representative Verification
export interface ISalesRepRepository {
    isSalesRepAllowedToOverrideFee(salesRepId: string): Promise<boolean>;
}

// Monolithic DB Service interface that extends all segregated repositories for backward compatibility
export interface IDatabaseService extends 
    ILeadRepository, 
    ICustomerRepository, 
    ISubscriptionRepository, 
    IServiceHistoryRepository, 
    ISettingsRepository, 
    ISalesRepRepository {}
