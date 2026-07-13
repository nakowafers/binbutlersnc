import { ICustomerRepository } from '@/lib/db/types';
import { IPaymentService } from '@/lib/payment/types';

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
    notes?: string;
    scentPreference?: string;
}

export class AdminCustomerService {
    constructor(
        private readonly customerRepo: ICustomerRepository,
        private readonly paymentService: IPaymentService,
        private readonly stripeConfigured: boolean
    ) {}

    async listCustomers() {
        return this.customerRepo.getAllCustomersWithDetails();
    }

    async updateCustomer(input: AdminCustomerUpdateInput): Promise<void> {
        if (!input.customerId) {
            throw new AdminServiceError(400, 'Missing customerId');
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

        await this.syncStripeMetadata(input);
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
        });
    }
}

export class AdminServiceError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}
