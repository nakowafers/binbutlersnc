import { Lead, Customer, Address, Subscription, ServiceHistory, CustomerWithDetails, DispatchStop, SalesRep } from '@/lib/types';
import { IDatabaseService, DueSubscriptionResult, CreateDispatchRouteInput, CreateDispatchStopInput, DispatchSetupStatus } from './types';
import { D1LeadRepositoryAdapter } from './adapters/D1LeadRepositoryAdapter';
import { D1CustomerRepositoryAdapter } from './adapters/D1CustomerRepositoryAdapter';
import { D1SubscriptionRepositoryAdapter } from './adapters/D1SubscriptionRepositoryAdapter';
import { D1ServiceHistoryRepositoryAdapter } from './adapters/D1ServiceHistoryRepositoryAdapter';
import { D1SettingsRepositoryAdapter } from './adapters/D1SettingsRepositoryAdapter';
import { D1SalesRepRepositoryAdapter } from './adapters/D1SalesRepRepositoryAdapter';
import { D1DispatchStopRepositoryAdapter } from './adapters/D1DispatchStopRepositoryAdapter';

export class D1DatabaseAdapter implements IDatabaseService {
    private readonly leads: D1LeadRepositoryAdapter;
    private readonly customers: D1CustomerRepositoryAdapter;
    private readonly subscriptions: D1SubscriptionRepositoryAdapter;
    private readonly serviceHistory: D1ServiceHistoryRepositoryAdapter;
    private readonly settings: D1SettingsRepositoryAdapter;
    private readonly salesReps: D1SalesRepRepositoryAdapter;
    private readonly dispatchStops: D1DispatchStopRepositoryAdapter;

    constructor(db: D1Database) {
        this.leads = new D1LeadRepositoryAdapter(db);
        this.customers = new D1CustomerRepositoryAdapter(db);
        this.subscriptions = new D1SubscriptionRepositoryAdapter(db);
        this.serviceHistory = new D1ServiceHistoryRepositoryAdapter(db);
        this.settings = new D1SettingsRepositoryAdapter(db);
        this.salesReps = new D1SalesRepRepositoryAdapter(db);
        this.dispatchStops = new D1DispatchStopRepositoryAdapter(db);
    }

    createLead(id: string, email: string, address: string, firstName: string, lastName: string, salesRepId: string | null, tosAcceptedAt: string | null): Promise<void> {
        return this.leads.createLead(id, email, address, firstName, lastName, salesRepId, tosAcceptedAt);
    }

    getLeadById(id: string): Promise<Lead | null> {
        return this.leads.getLeadById(id);
    }

    getLeadByEmail(email: string): Promise<Lead | null> {
        return this.leads.getLeadByEmail(email);
    }

    updateLeadMetadata(id: string, firstName: string, lastName: string, address: string, salesRepId: string | null, tosAcceptedAt: string | null): Promise<void> {
        return this.leads.updateLeadMetadata(id, firstName, lastName, address, salesRepId, tosAcceptedAt);
    }

    getCustomerById(id: string): Promise<Customer | null> {
        return this.customers.getCustomerById(id);
    }

    getCustomerByEmail(email: string): Promise<Customer | null> {
        return this.customers.getCustomerByEmail(email);
    }

    updateCustomerStripeId(customerId: string, stripeCustomerId: string): Promise<void> {
        return this.customers.updateCustomerStripeId(customerId, stripeCustomerId);
    }

    updateCustomerAddressId(customerId: string, addressId: string): Promise<void> {
        return this.customers.updateCustomerAddressId(customerId, addressId);
    }

    updateCustomer(customerId: string, details: {
        firstName?: string;
        lastName?: string;
        phoneNumber?: string;
    }): Promise<void> {
        return this.customers.updateCustomer(customerId, details);
    }

    getStripeCustomerId(customerId: string): Promise<string | null> {
        return this.customers.getStripeCustomerId(customerId);
    }

    getAddressById(id: string): Promise<Address | null> {
        return this.customers.getAddressById(id);
    }

    getAddressByRawAndCustomer(rawAddress: string, customerId: string): Promise<{ id: string } | null> {
        return this.customers.getAddressByRawAndCustomer(rawAddress, customerId);
    }

    updateAddressDetails(addressId: string, details: {
        serviceDay?: string;
        trashDay?: string;
    }): Promise<void> {
        return this.customers.updateAddressDetails(addressId, details);
    }

    updateAddress(addressId: string, details: {
        rawAddress?: string;
        latitude?: number | null;
        longitude?: number | null;
        trashDay?: string;
        notes?: string;
        scentPreference?: string;
    }): Promise<void> {
        return this.customers.updateAddress(addressId, details);
    }

    getAllCustomersWithDetails(): Promise<CustomerWithDetails[]> {
        return this.customers.getAllCustomersWithDetails();
    }

    updateAddressNotes(addressId: string, notes: string): Promise<void> {
        return this.customers.updateAddressNotes(addressId, notes);
    }

    deleteCustomerCascade(customerId: string): Promise<void> {
        return this.customers.deleteCustomerCascade(customerId);
    }

    getSubscriptionByCustomerId(customerId: string): Promise<Subscription | null> {
        return this.subscriptions.getSubscriptionByCustomerId(customerId);
    }

    getSubscriptionByIdAndCustomer(id: string, customerId: string): Promise<Subscription | null> {
        return this.subscriptions.getSubscriptionByIdAndCustomer(id, customerId);
    }

    updateSubscriptionPauseStatus(id: string, isPaused: number): Promise<void> {
        return this.subscriptions.updateSubscriptionPauseStatus(id, isPaused);
    }

    getSubscriptionIdByStripeId(stripeSubscriptionId: string): Promise<string | null> {
        return this.subscriptions.getSubscriptionIdByStripeId(stripeSubscriptionId);
    }

    updateSubscriptionStatus(stripeSubscriptionId: string, status: string, currentPeriodEnd: string | null): Promise<void> {
        return this.subscriptions.updateSubscriptionStatus(stripeSubscriptionId, status, currentPeriodEnd);
    }

    isSubscriptionPaused(id: string): Promise<boolean> {
        return this.subscriptions.isSubscriptionPaused(id);
    }

    getDueSubscriptions(targetServiceDate: string): Promise<DueSubscriptionResult[]> {
        return this.subscriptions.getDueSubscriptions(targetServiceDate);
    }

    getActiveSubscriptionsCount(): Promise<number> {
        return this.subscriptions.getActiveSubscriptionsCount();
    }

    calculateEstimatedWeeklyRevenue(): Promise<number> {
        return this.subscriptions.calculateEstimatedWeeklyRevenue();
    }

    getServiceHistoryByCustomerId(customerId: string, limit: number = 5): Promise<ServiceHistory[]> {
        return this.serviceHistory.getServiceHistoryByCustomerId(customerId, limit);
    }

    getCompletedStopsCountLast7Days(): Promise<number> {
        return this.serviceHistory.getCompletedStopsCountLast7Days();
    }

    getRecentActivity(limit: number = 5): Promise<Array<{ customer: string; status: string; time: string; address: string }>> {
        return this.serviceHistory.getRecentActivity(limit);
    }

    updateServiceHistoryOnCompletion(subscriptionId: string, completedAt: string | null): Promise<void> {
        return this.serviceHistory.updateServiceHistoryOnCompletion(subscriptionId, completedAt);
    }

    updateServiceHistoryOnSkipped(subscriptionId: string, completedAt: string | null): Promise<void> {
        return this.serviceHistory.updateServiceHistoryOnSkipped(subscriptionId, completedAt);
    }

    logDispatchedJobs(
        historyInserts: Array<{ id: string; subscriptionId: string; date: string; status: string; binQuantity?: number }>,
        retryInserts: Array<{ id: string; subscriptionId: string; date: string; errorMsg: string }>
    ): Promise<void> {
        return this.serviceHistory.logDispatchedJobs(historyInserts, retryInserts);
    }

    getGlobalSetting(key: string): Promise<string | null> {
        return this.settings.getGlobalSetting(key);
    }

    setGlobalSetting(key: string, value: string): Promise<void> {
        return this.settings.setGlobalSetting(key, value);
    }

    acquireLock(key: string, value: string, expireThreshold: number): Promise<boolean> {
        return this.settings.acquireLock(key, value, expireThreshold);
    }

    isSalesRepAllowedToOverrideFee(salesRepId: string): Promise<boolean> {
        return this.salesReps.isSalesRepAllowedToOverrideFee(salesRepId);
    }

    createDispatchStops(stops: CreateDispatchStopInput[]): Promise<void> {
        return this.dispatchStops.createDispatchStops(stops);
    }

    createDispatchRoute(route: CreateDispatchRouteInput): Promise<void> {
        return this.dispatchStops.createDispatchRoute(route);
    }

    getRouteStops(driverSalesRepId: string, serviceDate: string, includeTerminal?: boolean): Promise<DispatchStop[]> {
        return this.dispatchStops.getRouteStops(driverSalesRepId, serviceDate, includeTerminal);
    }

    getStopById(id: string): Promise<DispatchStop | null> {
        return this.dispatchStops.getStopById(id);
    }

    markDispatchStopCompleted(id: string, updatedBySalesRepId: string, completedAt: string): Promise<void> {
        return this.dispatchStops.markDispatchStopCompleted(id, updatedBySalesRepId, completedAt);
    }

    skipDispatchStop(id: string, updatedBySalesRepId: string, reason: string, skippedAt: string): Promise<void> {
        return this.dispatchStops.skipDispatchStop(id, updatedBySalesRepId, reason, skippedAt);
    }

    getActiveAdminDrivers(): Promise<SalesRep[]> {
        return this.dispatchStops.getActiveAdminDrivers();
    }

    getAdminDriverByEmail(email: string): Promise<SalesRep | null> {
        return this.dispatchStops.getAdminDriverByEmail(email);
    }

    getDispatchSetupStatus(): Promise<DispatchSetupStatus> {
        return this.dispatchStops.getDispatchSetupStatus();
    }

    updateAddressCoordinates(address: string, latitude: number, longitude: number): Promise<void> {
        return this.dispatchStops.updateAddressCoordinates(address, latitude, longitude);
    }

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
    }): Promise<void> {
        return this.leads.convertLeadToCustomerTransaction(params);
    }

    claimWebhookEvent(id: string, eventType: string): Promise<boolean> {
        return this.leads.claimWebhookEvent(id, eventType);
    }

    releaseWebhookEventClaim(id: string): Promise<void> {
        return this.leads.releaseWebhookEventClaim(id);
    }
}
