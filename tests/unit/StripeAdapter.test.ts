import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StripeAdapter, StripeConfig } from '../../src/lib/payment/StripeAdapter';
import { CheckoutSessionParams } from '../../src/lib/payment/types';

const mockCreateCheckoutSession = vi.fn();
const mockRetrievePrice = vi.fn();
const mockCustomerList = vi.fn();

vi.mock('stripe', () => {
    const StripeMock = function () {
        return {
            checkout: {
                sessions: {
                    create: mockCreateCheckoutSession,
                },
            },
            prices: {
                retrieve: mockRetrievePrice,
            },
            customers: {
                list: mockCustomerList,
            },
        };
    };
    StripeMock.createSubtleCryptoProvider = () => ({
        computeHMACSignature: vi.fn(),
        computeHMACSignatureAsync: vi.fn(),
    });
    return { default: StripeMock };
});

describe('StripeAdapter', () => {
    let adapter: StripeAdapter;
    const config: StripeConfig = {
        secretKey: 'sk_test_xxx',
        monthlyPriceId: 'price_monthly',
        quarterlyPriceId: 'price_quarterly',
        oneTimePriceId: 'price_onetime',
        setupFeePriceId: 'price_setup',
    };

    const baseParams: CheckoutSessionParams = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        frequency: 'monthly',
        binQuantity: 1,
        phoneNumber: '555-1234',
        trashDay: 'MON',
        providerName: 'Waste Co',
        leadId: 'lead_123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        adapter = new StripeAdapter(config);
        mockCustomerList.mockResolvedValue({ data: [] });
        mockRetrievePrice.mockResolvedValue({ product: 'prod_setup' });
        mockCreateCheckoutSession.mockResolvedValue({ url: 'https://stripe.com/session/123' });
    });

    describe('createCheckoutSession', () => {
        it('should set trial_end to the second monthly service date for future date subscription', async () => {
            const params = {
                ...baseParams,
                nextServiceDate: '2026-06-15',
            };

            await adapter.createCheckoutSession(params);

            expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode: 'subscription',
                    subscription_data: expect.objectContaining({
                        trial_end: expect.any(Number),
                    }),
                })
            );

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.subscription_data.trial_period_days).toBeUndefined();
            expect(callArgs.subscription_data.billing_cycle_anchor).toBeUndefined();
            expect(callArgs.subscription_data.proration_behavior).toBeUndefined();
            expect(callArgs.subscription_data.trial_end).toBe(1783987199);
        });

        it('should set trial_end to the second quarterly service date for future date subscription', async () => {
            const params = {
                ...baseParams,
                frequency: 'quarterly' as const,
                nextServiceDate: '2026-06-15',
            };

            await adapter.createCheckoutSession(params);

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.subscription_data.trial_period_days).toBeUndefined();
            expect(callArgs.subscription_data.trial_end).toBe(1788825599);
        });

        it('should not set trial_end when nextServiceDate is not provided (falls back to trial)', async () => {
            await adapter.createCheckoutSession(baseParams);

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.subscription_data).toBeDefined();
            expect(callArgs.subscription_data.trial_end).toBeUndefined();
            expect(callArgs.subscription_data.trial_period_days).toBe(28);
        });

        it('should use 84-day trial for quarterly when no nextServiceDate', async () => {
            const params = { ...baseParams, frequency: 'quarterly' as const };

            await adapter.createCheckoutSession(params);

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.subscription_data.trial_period_days).toBe(84);
        });

        it('should use payment mode for one-time regardless of nextServiceDate', async () => {
            const params = {
                ...baseParams,
                frequency: 'one-time' as const,
                nextServiceDate: '2026-06-15',
            };

            await adapter.createCheckoutSession(params);

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.mode).toBe('payment');
            expect(callArgs.subscription_data).toBeUndefined();
        });

        it('should include next_service_date in metadata', async () => {
            const params = {
                ...baseParams,
                nextServiceDate: '2026-06-15',
            };

            await adapter.createCheckoutSession(params);

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.metadata.next_service_date).toBe('2026-06-15');
        });

        it('should include empty next_service_date in metadata when not provided', async () => {
            await adapter.createCheckoutSession(baseParams);

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.metadata.next_service_date).toBe('');
        });

        it('should use 28-day trial for monthly when no nextServiceDate', async () => {
            await adapter.createCheckoutSession(baseParams);

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.subscription_data.trial_period_days).toBe(28);
        });
    });
});
