import { ICustomerRepository, IServiceHistoryRepository, ISubscriptionRepository } from '@/lib/db/types';
import { getTodayDateString, validateFirstServiceDate } from '@/lib/date-utils';
import { IPaymentService } from '@/lib/payment/types';

type AdminCustomerRepository = ICustomerRepository & ISubscriptionRepository & IServiceHistoryRepository;

export interface AdminCustomerUpdateInput {
    customerId: string;
    addressId: string;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    rawAddress?: string;
    latitude?: number | null;
    longitude?: number | null;
    trashDay?: string;
    serviceDay?: string;
    notes?: string;
    scentPreference?: string;
    manualRescheduleFirstServiceDate?: string;
}

export class AdminCustomerService {
    constructor(
        private readonly customerRepo: AdminCustomerRepository,
        private readonly paymentService: IPaymentService,
        private readonly stripeConfigured: boolean
    ) {}

    async listCustomers() {
        const customers = await this.customerRepo.getAllCustomersWithDetails();
        const today = getTodayDateString();

        return customers.map((customer) => {
            const completedServiceCount = Number(customer.completed_service_count ?? customer.completedServiceCount ?? 0);
            const skippedServiceCount = Number(customer.skipped_service_count ?? customer.skippedServiceCount ?? 0);
            const hasMissedFirstServiceDate = !!customer.next_service_date && customer.next_service_date < today;

            return {
                ...customer,
                needs_first_service_reschedule: completedServiceCount === 0 && (skippedServiceCount > 0 || hasMissedFirstServiceDate),
            };
        });
    }

    async updateCustomer(input: AdminCustomerUpdateInput): Promise<void> {
        if (!input.customerId) {
            throw new AdminServiceError(400, 'Missing customerId');
        }

        if (input.manualRescheduleFirstServiceDate !== undefined) {
            await this.manualRescheduleFirstService(input);
        }

        const hasCustomerUpdates = input.firstName !== undefined || input.lastName !== undefined || input.phoneNumber !== undefined;
        if (hasCustomerUpdates) {
            await this.customerRepo.updateCustomer(input.customerId, {
                firstName: input.firstName,
                lastName: input.lastName,
                phoneNumber: input.phoneNumber,
            });
        }

        const hasAddressUpdates = input.rawAddress !== undefined
            || input.latitude !== undefined
            || input.longitude !== undefined
            || input.trashDay !== undefined
            || input.notes !== undefined
            || input.scentPreference !== undefined;

        if (input.addressId && hasAddressUpdates) {
            await this.customerRepo.updateAddress(input.addressId, {
                rawAddress: input.rawAddress,
                latitude: input.latitude,
                longitude: input.longitude,
                trashDay: input.trashDay,
                notes: input.notes,
                scentPreference: input.scentPreference,
            });
        }

        if (hasCustomerUpdates || hasAddressUpdates) {
            await this.syncStripeMetadata(input);
        }
    }

    async updateNotes(addressId: string, notes: string): Promise<void> {
        if (!addressId || notes === undefined) {
            throw new AdminServiceError(400, 'Missing addressId or notes');
        }

        await this.customerRepo.updateAddressNotes(addressId, notes);
    }

    async deleteCustomer(customerId: string): Promise<void> {
        if (!customerId) {
            throw new AdminServiceError(400, 'Missing customerId');
        }

        const customers = await this.customerRepo.getAllCustomersWithDetails();
        const customer = customers.find(c => c.id === customerId);

        if (!customer) {
            throw new AdminServiceError(404, 'Customer not found');
        }

        if (customer.subscription_status && customer.subscription_status !== 'canceled') {
            throw new AdminServiceError(403, 'Only customers with no subscription or a canceled subscription can be deleted');
        }

        await this.customerRepo.deleteCustomerCascade(customerId);
    }

    private async syncStripeMetadata(input: AdminCustomerUpdateInput): Promise<void> {
        const stripeCustomerId = await this.customerRepo.getStripeCustomerId(input.customerId);
        if (!stripeCustomerId) {
            return;
        }

        if (!this.stripeConfigured) {
            throw new AdminServiceError(500, 'Stripe API key not configured');
        }

        const [customer, address] = await Promise.all([
            this.customerRepo.getCustomerById(input.customerId),
            input.addressId ? this.customerRepo.getAddressById(input.addressId) : null,
        ]);

        if (!customer) {
            return;
        }

        const mergedAddress = address?.raw_address || input.rawAddress || '';
        const mergedTrashDay = input.trashDay || address?.trash_day || '';
        const mergedLat = input.latitude !== undefined ? input.latitude : address?.latitude ?? null;
        const mergedLng = input.longitude !== undefined ? input.longitude : address?.longitude ?? null;

        const firstName = input.firstName ?? customer.first_name ?? '';
        const lastName = input.lastName ?? customer.last_name ?? '';
        const combinedName = `${firstName} ${lastName}`.trim();

        await this.paymentService.updateCustomerServiceDetails(stripeCustomerId, {
            name: combinedName || undefined,
            firstName,
            lastName,
            address: mergedAddress || '',
            trashDay: mergedTrashDay,
            notes: input.notes ?? address?.notes ?? '',
            scentPreference: input.scentPreference ?? address?.scent_preference ?? '',
            phoneNumber: input.phoneNumber ?? customer.phone_number ?? '',
            lat: mergedLat,
            lng: mergedLng,
            nextServiceDate: input.manualRescheduleFirstServiceDate,
        });
    }

    private async manualRescheduleFirstService(input: AdminCustomerUpdateInput): Promise<void> {
        const subscription = await this.customerRepo.getSubscriptionByCustomerId(input.customerId);
        if (!subscription) {
            throw new AdminServiceError(404, 'Subscription not found');
        }

        const serviceDay = input.addressId ? (await this.customerRepo.getAddressById(input.addressId))?.service_day : null;
        const isOneTime = subscription.status === 'one-time' || subscription.frequency_days === 0;
        const validationError = validateFirstServiceDate({
            date: input.manualRescheduleFirstServiceDate || '',
            serviceDay,
            isOneTime,
        });

        if (validationError) {
            throw new AdminServiceError(400, validationError);
        }

        const attemptSummary = await this.customerRepo.getFirstServiceAttemptSummary(subscription.id);
        const hasCompletedService = attemptSummary.completedCount > 0;
        const hasSkippedAttempt = attemptSummary.skippedCount > 0;
        const hasMissedFirstServiceDate = !!subscription.next_service_date
            && subscription.next_service_date < getTodayDateString();

        if (hasCompletedService || (!hasSkippedAttempt && !hasMissedFirstServiceDate)) {
            throw new AdminServiceError(400, 'Manual Reschedule is only available for first-service problems');
        }

        await this.customerRepo.updateSubscriptionFirstServiceDate(subscription.id, input.manualRescheduleFirstServiceDate || '');
    }
}

export class AdminServiceError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}
