import Database from 'better-sqlite3';
import { SERVICE_CYCLE_RECOVERY_INVENTORY_SQL, buildServiceCycleRecoveryInventory, type RecoveryInventoryCandidate } from '../src/lib/reports/serviceCycleRecoveryInventory';
import { StripeAuthoritativeSubscriptionEvidenceProvider, stripePriceCadenceAllowlistFromEnvironment } from '../src/lib/reports/StripeAuthoritativeSubscriptionEvidenceProvider';
import type { StripeSubscriptionEvidence, StripeSubscriptionEvidenceProvider } from '../src/lib/reports/serviceCycleRecovery';
import { D1ServiceCycleRecoveryReviewRepository, persistNeedsReviewClassifications } from '../src/lib/reports/D1ServiceCycleRecoveryReviewRepository';
import { assertLocalOnlyAuditArguments, findLocalSqlitePath, optionValue, readJsonFixture } from './local-audit';

type Row = Record<string, string | number | null>;
type EvidenceFixture = Record<string, StripeSubscriptionEvidence>;

export function groupRecoveryRows(rows: readonly Row[]): RecoveryInventoryCandidate[] {
    const candidates = new Map<string, RecoveryInventoryCandidate>();
    for (const row of rows) {
        const id = String(row.subscription_id);
        let candidate = candidates.get(id);
        if (!candidate) {
            candidate = { subscription: { id, stripeSubscriptionId: row.stripe_subscription_id as string | null, status: String(row.status), serviceDay: row.service_day as RecoveryInventoryCandidate['subscription']['serviceDay'], frequencyDays: Number(row.frequency_days), currentPeriodEnd: row.current_period_end as string | null, serviceCycleAnchor: row.service_cycle_anchor as string | null }, history: [], stops: [] };
            candidates.set(id, candidate);
        }
        if (row.history_id && !candidate.history.some((history) => history.id === row.history_id)) candidate.history.push({ id: String(row.history_id), serviceDate: String(row.history_service_date), dispatchStatus: String(row.history_dispatch_status), completedAt: row.history_completed_at as string | null, cycleDueDate: row.history_cycle_due_date as string | null, serviceCycleId: row.history_cycle_id as string | null });
        if (row.stop_id && !candidate.stops.some((stop) => stop.id === row.stop_id)) candidate.stops.push({ id: String(row.stop_id), serviceHistoryId: String(row.stop_history_id), serviceDate: String(row.stop_service_date), dispatchStatus: String(row.stop_dispatch_status), cycleDueDate: row.stop_cycle_due_date as string | null, serviceCycleId: row.stop_cycle_id as string | null });
    }
    return [...candidates.values()];
}

function fixtureProvider(fixture: EvidenceFixture | null): StripeSubscriptionEvidenceProvider {
    return { getEvidence: async (subscriptionId) => fixture?.[subscriptionId] ?? null };
}

interface LocalSqliteForRecoveryPersistence {
    prepare(query: string): {
        run(...values: unknown[]): { changes: number };
        get(...values: unknown[]): unknown;
    };
}

function asLocalD1(db: LocalSqliteForRecoveryPersistence): D1Database {
    return {
        prepare(query: string) {
            const statement = db.prepare(query);
            let values: unknown[] = [];
            const prepared = {
                bind(...nextValues: unknown[]) {
                    values = nextValues;
                    return prepared;
                },
                async run() {
                    const result = statement.run(...values);
                    return { success: true, meta: { changes: result.changes } };
                },
                async first<T>() {
                    return (statement.get(...values) as T | undefined) ?? null;
                },
            };
            return prepared as unknown as D1PreparedStatement;
        },
    } as D1Database;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    assertLocalOnlyAuditArguments(args, ['--db', '--print-sql', '--stripe-evidence', '--stripe-live', '--persist-local-needs-review']);
    if (args.includes('--print-sql')) {
        console.log(SERVICE_CYCLE_RECOVERY_INVENTORY_SQL.trim());
        return;
    }
    const fixture = readJsonFixture<EvidenceFixture>(optionValue(args, '--stripe-evidence'), 'Stripe evidence fixture');
    if (fixture && args.includes('--stripe-live')) throw new Error('Choose either --stripe-evidence or --stripe-live, not both.');
    const operationsKey = process.env.STRIPE_LIVE_OPERATIONS_KEY;
    const priceCadenceAllowlist = stripePriceCadenceAllowlistFromEnvironment(process.env);
    if (args.includes('--stripe-live') && !operationsKey) throw new Error('STRIPE_LIVE_OPERATIONS_KEY is required only with --stripe-live.');
    if (args.includes('--stripe-live') && priceCadenceAllowlist.size === 0) throw new Error('A read-only live audit requires configured recurring Stripe Price IDs.');
    const provider = args.includes('--stripe-live') ? StripeAuthoritativeSubscriptionEvidenceProvider.fromSecretKey(operationsKey!, priceCadenceAllowlist) : fixtureProvider(fixture);
    const persistLocalNeedsReview = args.includes('--persist-local-needs-review');
    const db = new Database(findLocalSqlitePath(optionValue(args, '--db')), { readonly: !persistLocalNeedsReview, fileMustExist: true });
    const candidates = groupRecoveryRows(db.prepare(SERVICE_CYCLE_RECOVERY_INVENTORY_SQL).all() as Row[]);
    const inventory = await buildServiceCycleRecoveryInventory(candidates, provider);
    const persistedReviews = persistLocalNeedsReview
        ? await persistNeedsReviewClassifications(
            new D1ServiceCycleRecoveryReviewRepository(asLocalD1(db as unknown as LocalSqliteForRecoveryPersistence)),
            inventory.map(({ subscriptionId, classification }) => ({ subscriptionId, classification })),
            new Date().toISOString(),
        )
        : [];
    console.log(JSON.stringify({
        source: 'local_sqlite',
        mode: persistLocalNeedsReview ? 'persist_local_needs_review' : 'read_only',
        stripeEvidence: args.includes('--stripe-live') ? 'read_only_live' : fixture ? 'fixture' : 'none',
        persistedReviewCount: persistedReviews.length,
        inventory,
    }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
