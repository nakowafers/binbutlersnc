import { describe, expect, it, vi } from 'vitest';
import { CheckoutHttpError, CheckoutService } from '../../src/lib/checkout/CheckoutService';
import { CheckoutInput } from '../../src/lib/checkout/checkoutSchema';
import { ILeadRepository, ISalesRepRepository } from '../../src/lib/db/types';
import { IPaymentService } from '../../src/lib/payment/types';
import { PRICING_VERSION } from '@/lib/pricing';

function validInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
    return {
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        address: '123 main st',
        lat: 35,
        lng: -80,
        phone_number: '555-1212',
        trash_day: 'MON',
        notes: '',
        scent_preference: 'lavender',
        bin_quantity: 1,
        frequency: 'monthly',
        pricing_version: PRICING_VERSION,
        tos_accepted: true,
        age_confirmed: true,
        contact_consent: true,
        ...overrides,
    };
}

const env = {
    DB: {} as D1Database,
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_MONTHLY_PRICE_ID: 'price_monthly',
    STRIPE_BIMONTHLY_PRICE_ID: 'price_bimonthly',
    STRIPE_QUARTERLY_PRICE_ID: 'price_quarterly',
    STRIPE_ONETIME_PRICE_ID: 'price_onetime',
    STRIPE_SETUP_FEE_PRICE_ID: 'price_setup',
    SERVICEABLE_ZIP_CODES: '28202,28203',
} as any;

function paymentMock(): IPaymentService {
    return {
        createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://stripe.test/session' }),
        getCustomerIdByEmail: vi.fn(),
        updateCustomerServiceDetails: vi.fn(),
        createBillingPortalSession: vi.fn(),
        retrieveSubscriptionPeriodEnd: vi.fn(),
        retrieveCheckoutSession: vi.fn(),
        verifyWebhookEvent: vi.fn(),
    };
}

describe('CheckoutService', () => {
    it('rejects unserviceable ZIP codes before creating a payment session', async () => {
        const payment = paymentMock();
        const service = new CheckoutService(env, null, null, payment);

        await expect(service.createCheckout(validInput({ zip_code: '99999' }), 'https://example.com'))
            .rejects.toEqual(new CheckoutHttpError(400, 'Sorry, we don\'t service this area yet'));

        expect(payment.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('reuses an existing lead and passes it to checkout', async () => {
        const leadRepo = {
            getLeadByEmail: vi.fn().mockResolvedValue({ id: 'lead_existing' }),
            updateLeadMetadata: vi.fn().mockResolvedValue(undefined),
            createLead: vi.fn(),
        } as unknown as ILeadRepository;
        const payment = paymentMock();
        const service = new CheckoutService(env, leadRepo, null, payment);

        await service.createCheckout(validInput(), 'https://example.com');

        expect(leadRepo.updateLeadMetadata).toHaveBeenCalledWith(
            'lead_existing',
            'Test',
            'User',
            '123 main st',
            null,
            expect.any(String)
        );
        expect(payment.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
            leadId: 'lead_existing',
            successUrl: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
            cancelUrl: 'https://example.com/signup',
        }));
    });

    it('drops unauthorized setup fee overrides', async () => {
        const salesRepRepo = {
            isSalesRepAllowedToOverrideFee: vi.fn().mockResolvedValue(false),
        } as unknown as ISalesRepRepository;
        const payment = paymentMock();
        const service = new CheckoutService(env, null, salesRepRepo, payment);

        await service.createCheckout(validInput({ sales_rep_id: 'rep_1', setup_fee_override: 10 }), 'https://example.com');

        expect(payment.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
            setup_fee_override: undefined,
        }));
    });

    it.each([
        ['monthly', '2026-04-06'],
        ['bimonthly', '2026-05-04'],
        ['quarterly', '2026-06-01'],
    ] as const)('anchors an attested %s D2D subscription on the first Service Day after its cadence', async (frequency, expectedAnchor) => {
        const payment = paymentMock();
        const service = new CheckoutService(env, null, null, payment);

        await service.createCheckout(validInput({
            frequency,
            sales_rep_id: 'REP_1',
            d2d_service_completed: true,
            d2d_service_date: '2026-03-08', // Sunday before the configured Monday Service Day
            next_service_date: '2026-03-08',
        }), 'https://example.com');

        expect(payment.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
            d2dServiceCompleted: true,
            d2dServiceDate: '2026-03-08',
            serviceCycleAnchor: expectedAnchor,
        }));
    });
});
