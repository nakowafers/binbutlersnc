import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { DispatchCoordinator } from '@/lib/dispatch/DispatchCoordinator';
import { GeoapifyGeocoder } from '@/lib/geocoding/GeoapifyGeocoder';
import { StripeAdapter } from '@/lib/payment/StripeAdapter';
import { StripeServiceDayReanchorGateway } from '@/lib/payment/StripeServiceDayReanchorGateway';
import { D1ServiceDayReanchorRepository } from '@/lib/service-cycle/D1ServiceDayReanchorRepository';
import { ServiceDayReanchor } from '@/lib/service-cycle/ServiceDayReanchor';
import { SubscriptionLifecycle } from '@/lib/payment/SubscriptionLifecycle';
import { Env } from '@/lib/types';

export function createDatabase(env: Env): D1DatabaseAdapter {
    return new D1DatabaseAdapter(env.DB);
}

export function createPaymentService(env: Env): StripeAdapter {
    return new StripeAdapter({
        secretKey: env.STRIPE_SECRET_KEY,
        monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
        bimonthlyPriceId: env.STRIPE_BIMONTHLY_PRICE_ID,
        quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
        oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
        setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
        extraBinMonthlyPriceId: env.STRIPE_EXTRA_BIN_MONTHLY_PRICE_ID,
        extraBinBimonthlyPriceId: env.STRIPE_EXTRA_BIN_BIMONTHLY_PRICE_ID,
        extraBinQuarterlyPriceId: env.STRIPE_EXTRA_BIN_QUARTERLY_PRICE_ID,
    });
}

export function createDispatchCoordinator(env: Env): DispatchCoordinator {
    const db = createDatabase(env);
    return new DispatchCoordinator(db, db, db, db, new GeoapifyGeocoder(env.GEOAPIFY_API_KEY));
}

export function createSubscriptionLifecycle(env: Env): SubscriptionLifecycle {
    const db = createDatabase(env);
    return new SubscriptionLifecycle(db, db, db, db, createPaymentService(env));
}

/**
 * Creates the deliberately narrow audited schedule re-anchor operation.
 * It does not modify Stripe pricing or Stripe's billing-cycle anchor.
 */
export function createServiceDayReanchor(env: Env): ServiceDayReanchor {
    return new ServiceDayReanchor(
        new D1ServiceDayReanchorRepository(env.DB),
        new StripeServiceDayReanchorGateway(env.STRIPE_SECRET_KEY),
    );
}
