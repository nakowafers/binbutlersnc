import Database from 'better-sqlite3';
import { StripeAuthoritativeSubscriptionEvidenceProvider, stripePriceCadenceAllowlistFromEnvironment } from '../src/lib/reports/StripeAuthoritativeSubscriptionEvidenceProvider';
import { buildBillingDriftAudit, runBillingDriftAudit, type BillingDriftLocalSubscription, type BillingDriftStripeEvidence } from '../src/lib/reports/billingDriftAudit';
import { assertLocalReadOnlyAuditArguments, findLocalSqlitePath, optionValue, readJsonFixture } from './local-audit';

type EvidenceFixture = Record<string, BillingDriftStripeEvidence>;

const LOCAL_SUBSCRIPTIONS_SQL = `
SELECT s.id AS subscription_id, s.stripe_subscription_id, s.status, s.frequency_days,
       s.current_period_end, s.service_cycle_anchor, a.service_day
FROM subscriptions s
LEFT JOIN customers c ON c.id = s.customer_id
LEFT JOIN addresses a ON a.id = c.address_id
WHERE s.stripe_subscription_id IS NOT NULL
ORDER BY s.id`;

interface ReadOnlySqlite {
    prepare(sql: string): { all(): unknown[] };
}

function localSubscriptions(db: ReadOnlySqlite): BillingDriftLocalSubscription[] {
    return (db.prepare(LOCAL_SUBSCRIPTIONS_SQL).all() as Array<Record<string, string | number | null>>).map((row) => ({
        subscriptionId: String(row.subscription_id), stripeSubscriptionId: row.stripe_subscription_id as string | null,
        status: String(row.status), frequencyDays: Number(row.frequency_days), currentPeriodEnd: row.current_period_end as string | null,
        serviceCycleAnchor: row.service_cycle_anchor as string | null, serviceDay: row.service_day as string | null,
    }));
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    assertLocalReadOnlyAuditArguments(args, ['--db', '--stripe-evidence', '--stripe-live', '--print-sql']);
    if (args.includes('--print-sql')) { console.log(LOCAL_SUBSCRIPTIONS_SQL.trim()); return; }
    const fixture = readJsonFixture<EvidenceFixture>(optionValue(args, '--stripe-evidence'), 'Stripe evidence fixture');
    if (fixture && args.includes('--stripe-live')) throw new Error('Choose either --stripe-evidence or --stripe-live, not both.');
    const operationsKey = process.env.STRIPE_LIVE_OPERATIONS_KEY;
    const priceCadenceAllowlist = stripePriceCadenceAllowlistFromEnvironment(process.env);
    if (args.includes('--stripe-live') && !operationsKey) throw new Error('STRIPE_LIVE_OPERATIONS_KEY is required only with --stripe-live.');
    if (args.includes('--stripe-live') && priceCadenceAllowlist.size === 0) throw new Error('A read-only live audit requires configured recurring Stripe Price IDs.');
    const liveProvider = args.includes('--stripe-live') ? StripeAuthoritativeSubscriptionEvidenceProvider.fromSecretKey(operationsKey!, priceCadenceAllowlist) : null;
    const local = localSubscriptions(new Database(findLocalSqlitePath(optionValue(args, '--db')), { readonly: true, fileMustExist: true }));
    const findings = args.includes('--stripe-live')
        ? await runBillingDriftAudit(local, { getBillingDriftEvidence: (id) => liveProvider!.getEvidence(id) })
        : buildBillingDriftAudit(local, new Map(Object.entries(fixture || {})));
    console.log(JSON.stringify({ source: 'local_sqlite', stripeEvidence: args.includes('--stripe-live') ? 'read_only_live' : fixture ? 'fixture' : 'none', findings }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'Local audit failed.'); process.exit(1); });
