import { ILeadRepository, ISalesRepRepository } from '@/lib/db/types';
import { IPaymentService } from '@/lib/payment/types';
import { Env } from '@/lib/types';
import { CheckoutInput, getMissingStripeConfig } from './checkoutSchema';

export class CheckoutService {
    constructor(
        private readonly env: Env,
        private readonly leadRepo: ILeadRepository | null,
        private readonly salesRepRepo: ISalesRepRepository | null,
        private readonly paymentService: IPaymentService
    ) {}

    async createCheckout(data: CheckoutInput, origin: string): Promise<{ url: string }> {
        const missingStripeConfig = getMissingStripeConfig(this.env, data);
        if (missingStripeConfig.length > 0) {
            throw new Error(`Missing Stripe configuration: ${missingStripeConfig.join(', ')}`);
        }

        this.assertServiceableZip(data);
        await this.authorizeSetupFeeOverride(data);

        const tosAcceptedAt = data.tos_accepted ? new Date().toISOString() : null;
        const leadId = await this.captureLead(data, tosAcceptedAt);

        const { url } = await this.paymentService.createCheckoutSession({
            email: data.email,
            firstName: data.first_name,
            lastName: data.last_name,
            frequency: data.frequency,
            binQuantity: data.bin_quantity,
            phoneNumber: data.phone_number,
            trashDay: data.trash_day,
            notes: data.notes || '',
            scentPreference: data.scent_preference,
            salesRepId: data.sales_rep_id,
            setup_fee_override: data.setup_fee_override,
            tosAcceptedAt,
            nextServiceDate: data.next_service_date,
            lat: data.lat,
            lng: data.lng,
            leadId,
            successUrl: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${origin}/signup`,
        });

        if (!url) {
            throw new Error('Failed to generate checkout session URL');
        }

        return { url };
    }

    private assertServiceableZip(data: CheckoutInput): void {
        if (!data.zip_code) {
            return;
        }

        const serviceableZips = (this.env.SERVICEABLE_ZIP_CODES || '').split(',').map(z => z.trim());
        if (!serviceableZips.includes(data.zip_code)) {
            throw new CheckoutHttpError(400, 'Sorry, we don\'t service this area yet');
        }
    }

    private async authorizeSetupFeeOverride(data: CheckoutInput): Promise<void> {
        if (data.setup_fee_override === undefined) {
            return;
        }

        if (!data.sales_rep_id || !this.salesRepRepo) {
            data.setup_fee_override = undefined;
            return;
        }

        try {
            const allowed = await this.salesRepRepo.isSalesRepAllowedToOverrideFee(data.sales_rep_id);
            if (!allowed) {
                data.setup_fee_override = undefined;
            }
        } catch (dbError) {
            console.error('Sales rep fee override check failed:', dbError);
            data.setup_fee_override = undefined;
        }
    }

    private async captureLead(data: CheckoutInput, tosAcceptedAt: string | null): Promise<string> {
        if (!this.leadRepo) {
            console.warn('DB binding missing, skipping lead capture');
            return crypto.randomUUID();
        }

        try {
            const existingLead = await this.leadRepo.getLeadByEmail(data.email);
            if (existingLead) {
                await this.leadRepo.updateLeadMetadata(
                    existingLead.id,
                    data.first_name,
                    data.last_name,
                    data.address,
                    data.sales_rep_id || null,
                    tosAcceptedAt
                );
                return existingLead.id;
            }

            const leadId = crypto.randomUUID();
            await this.leadRepo.createLead(
                leadId,
                data.email,
                data.address,
                data.first_name,
                data.last_name,
                data.sales_rep_id || null,
                tosAcceptedAt
            );
            return leadId;
        } catch (dbError) {
            console.error('Lead capture failed:', dbError);
            return crypto.randomUUID();
        }
    }
}

export class CheckoutHttpError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}
