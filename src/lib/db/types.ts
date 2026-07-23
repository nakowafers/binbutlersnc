import { Lead, Customer, Address, Subscription, ServiceHistory, CustomerWithDetails, DispatchStop, SalesRep } from '@/lib/types';

export interface DueSubscriptionResult extends Subscription {
    raw_address: string;
    latitude: number | null;
    longitude: number | null;
    service_day: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    phone_number?: string | null;
    notes?: string | null;
    scent_preference?: string | null;
    bin_quantity?: number;
    next_service_date?: string | null;
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
    getDueSubscriptions(targetServiceDate: string): Promise<DueSubscriptionResult[]>;
    clearConsumedFirstServiceDates(subscriptionIds: string[], serviceDate: string): Promise<void>;
    getActiveSubscriptionsCount(): Promise<number>;
    calculateEstimatedWeeklyRevenue(): Promise<number>;
    updateSubscriptionFirstServiceDate(id: string, firstServiceDate: string): Promise<void>;
}

// 4. Fulfillment & Service History Operations
export interface IServiceHistoryRepository {
    getServiceHistoryByCustomerId(customerId: string, limit?: number): Promise<ServiceHistory[]>;
    getCompletedStopsCountLast7Days(): Promise<number>;
    getRecentActivity(limit?: number): Promise<Array<{ customer: string; status: string; time: string; address: string }>>;
    
    updateServiceHistoryOnCompletion(subscriptionId: string, completedAt: string | null): Promise<void>;
    updateServiceHistoryOnSkipped(subscriptionId: string, completedAt: string | null): Promise<void>;
    getFirstServiceAttemptSummary(subscriptionId: string): Promise<{ completedCount: number; skippedCount: number }>;
    
    logDispatchedJobs(
        historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string; binQuantity?: number }>,
        retryInserts: Array<{ id: string; subscriptionId: string; date: string; errorMsg: string }>
    ): Promise<void>;
    
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

export interface DispatchSetupStatus {
    defaultDriverId: string | null;
    depotAddress: string | null;
    depotLat: number | null;
    depotLng: number | null;
    isConfigured: boolean;
    missing: string[];
}

export interface CreateDispatchStopInput {
    id: string;
    subscriptionId: string;
    serviceHistoryId: string;
    serviceDate: string;
    driverSalesRepId: string;
    routeSequenceOrder: number;
    customerName: string | null;
    rawAddress: string;
    latitude: number | null;
    longitude: number | null;
    binCount: number;
    customerScent: string | null;
    serviceNotes: string | null;
    customerPhone: string | null;
}

export interface CreateDispatchRouteInput {
    history: Array<{ id: string; subscriptionId: string; date: string; status: string; binQuantity?: number }>;
    stops: CreateDispatchStopInput[];
    consumedFirstService?: { subscriptionIds: string[]; serviceDate: string };
}

export interface IDispatchStopRepository {
    createDispatchStops(stops: CreateDispatchStopInput[]): Promise<void>;
    createDispatchRoute(route: CreateDispatchRouteInput): Promise<void>;
    getRouteStops(driverSalesRepId: string, serviceDate: string, includeTerminal?: boolean): Promise<DispatchStop[]>;
    getStopById(id: string): Promise<DispatchStop | null>;
    markDispatchStopCompleted(id: string, updatedBySalesRepId: string, completedAt: string): Promise<void>;
    skipDispatchStop(id: string, updatedBySalesRepId: string, reason: string, skippedAt: string): Promise<void>;
    getActiveAdminDrivers(): Promise<SalesRep[]>;
    getAdminDriverByEmail(email: string): Promise<SalesRep | null>;
    getDispatchSetupStatus(): Promise<DispatchSetupStatus>;
    updateAddressCoordinates(address: string, latitude: number, longitude: number): Promise<void>;
}

// Monolithic DB Service interface that extends all segregated repositories for backward compatibility
export interface IDatabaseService extends 
    ILeadRepository, 
    ICustomerRepository, 
    ISubscriptionRepository, 
    IServiceHistoryRepository, 
    ISettingsRepository, 
    ISalesRepRepository,
    IDispatchStopRepository {}
