import { StripeAdapter } from '../../src/lib/payment/StripeAdapter';
import { loadBillingDriftLocalSubscriptions, runBillingDriftAudit } from '../../src/lib/reports/billingDriftAudit';

interface BillingDriftAuditEnv {
    DB: D1Database;
    STRIPE_SECRET_KEY: string;
    STRIPE_MONTHLY_PRICE_ID?: string;
    STRIPE_BIMONTHLY_PRICE_ID?: string;
    STRIPE_QUARTERLY_PRICE_ID?: string;
}

const billingDriftAuditCron = {
    async fetch(): Promise<Response> {
        return new Response('Billing drift audit cron is running. Press s in the terminal to trigger the scheduled event.');
    },

    async scheduled(_event: ScheduledEvent, env: BillingDriftAuditEnv, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(this.handleAudit(env));
    },

    async handleAudit(env: BillingDriftAuditEnv): Promise<void> {
        const localSubscriptions = await loadBillingDriftLocalSubscriptions(env.DB);
        const findings = await runBillingDriftAudit(localSubscriptions, new StripeAdapter({
            secretKey: env.STRIPE_SECRET_KEY,
            monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
            bimonthlyPriceId: env.STRIPE_BIMONTHLY_PRICE_ID,
            quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
        }));
        console.log(JSON.stringify({
            event: 'billing_drift_audit_completed',
            checkedSubscriptionCount: localSubscriptions.length,
            findingCount: findings.length,
            findings,
        }));
    },
};

export default billingDriftAuditCron;
