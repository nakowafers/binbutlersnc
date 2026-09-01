import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StripeAdapter, StripeConfig } from '../../src/lib/payment/StripeAdapter';
import { CheckoutSessionParams } from '../../src/lib/payment/types';

const mockCreateCheckoutSession = vi.fn();
const mockRetrievePrice = vi.fn();
const mockCustomerList = vi.fn();
const mockCustomerRetrieve = vi.fn();
const mockCustomerUpdate = vi.fn();
const mockSubscriptionRetrieve = vi.fn();
const mockSubscriptionItemUpdate = vi.fn();

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
                retrieve: mockCustomerRetrieve,
                update: mockCustomerUpdate,
            },
            subscriptions: { retrieve: mockSubscriptionRetrieve },
            subscriptionItems: { update: mockSubscriptionItemUpdate },
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
        bimonthlyPriceId: 'price_bimonthly',
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
        notes: 'Waste Co',
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

        it('should set trial_end to the second bimonthly service date for future date subscription', async () => {
            await adapter.createCheckoutSession({
                ...baseParams,
                frequency: 'bimonthly',
                nextServiceDate: '2026-06-15',
            });

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.subscription_data.trial_period_days).toBeUndefined();
            expect(callArgs.subscription_data.trial_end).toBe(1786406399);
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

        it('should use 56-day trial for bimonthly when no nextServiceDate', async () => {
            await adapter.createCheckoutSession({ ...baseParams, frequency: 'bimonthly' });

            const callArgs = mockCreateCheckoutSession.mock.calls[0][0];
            expect(callArgs.subscription_data.trial_period_days).toBe(56);
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

    it('should throw a clear error when an extra bin price ID is missing', async () => {
            adapter = new StripeAdapter({
                ...config,
                extraBinMonthlyPriceId: undefined,
            });

            await expect(adapter.createCheckoutSession({
                ...baseParams,
                binQuantity: 3,
            })).rejects.toThrow('Missing Stripe extra bin price ID for monthly subscriptions');
        });
    });

    it('updates only the cadence-matched extra-bin item without proration and verifies Stripe state', async () => {
        adapter = new StripeAdapter({ ...config, extraBinMonthlyPriceId: 'price_extra_monthly', extraBinBimonthlyPriceId: 'price_extra_bimonthly', extraBinQuarterlyPriceId: 'price_extra_quarterly' });
        mockCustomerRetrieve
            .mockResolvedValueOnce({ id: 'cus_1', metadata: { bin_quantity: '3', keep: 'yes' } })
            .mockResolvedValueOnce({ id: 'cus_1', metadata: { bin_quantity: '3', keep: 'yes' } })
            .mockResolvedValueOnce({ id: 'cus_1', metadata: { bin_quantity: '4', keep: 'yes' } });
        mockCustomerUpdate.mockResolvedValue({ id: 'cus_1' });
        mockSubscriptionRetrieve
            .mockResolvedValueOnce({ id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [
                { id: 'si_base', quantity: 1, price: { id: 'price_monthly', recurring: { interval: 'day', interval_count: 28 } } },
                { id: 'si_extra', quantity: 1, price: { id: 'price_extra_monthly', recurring: { interval: 'day', interval_count: 28 } } },
            ] } })
            .mockResolvedValueOnce({ id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [
                { id: 'si_base', quantity: 1, price: { id: 'price_monthly', recurring: { interval: 'day', interval_count: 28 } } },
                { id: 'si_extra', quantity: 2, price: { id: 'price_extra_monthly', recurring: { interval: 'day', interval_count: 28 } } },
            ] } });
        mockSubscriptionItemUpdate.mockResolvedValue({ id: 'si_extra', quantity: 2 });

        const before = await adapter.getBinQuantityAdjustmentState('cus_1', 'sub_1');
        const after = await adapter.updateBinQuantityAdjustment({ customerId: 'cus_1', subscriptionId: 'sub_1', extraBinSubscriptionItemId: before.extraBinSubscriptionItemId, extraBinQuantity: 2, binQuantity: 4, idempotencyKey: 'adjustment-1' });

        expect(mockSubscriptionItemUpdate).toHaveBeenCalledWith('si_extra', { quantity: 2, proration_behavior: 'none' }, { idempotencyKey: 'adjustment-1:item' });
        expect(mockCustomerUpdate).toHaveBeenCalledWith('cus_1', { metadata: { bin_quantity: '4', keep: 'yes' } }, { idempotencyKey: 'adjustment-1:customer' });
        expect(after.extraBinQuantity).toBe(2);
        expect(after.customerBinQuantity).toBe(4);
    });

    it('rejects an ambiguous cadence-matched extra-bin configuration', async () => {
        adapter = new StripeAdapter({ ...config, extraBinMonthlyPriceId: 'price_extra_monthly', extraBinBimonthlyPriceId: 'price_extra_bimonthly', extraBinQuarterlyPriceId: 'price_extra_quarterly' });
        mockCustomerRetrieve.mockResolvedValue({ id: 'cus_1', metadata: {} });
        mockSubscriptionRetrieve.mockResolvedValue({ id: 'sub_1', customer: 'cus_1', status: 'active', items: { data: [
            { id: 'si_base', quantity: 1, price: { id: 'price_monthly', recurring: { interval: 'day', interval_count: 28 } } },
            { id: 'si_extra_1', quantity: 1, price: { id: 'price_extra_monthly', recurring: { interval: 'day', interval_count: 28 } } },
            { id: 'si_extra_2', quantity: 1, price: { id: 'price_extra_monthly', recurring: { interval: 'day', interval_count: 28 } } },
        ] } });

        await expect(adapter.getBinQuantityAdjustmentState('cus_1', 'sub_1')).rejects.toThrow('exactly one cadence-matched extra-bin price');
    });
});
