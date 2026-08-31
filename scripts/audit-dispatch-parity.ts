import Database from 'better-sqlite3';
import { buildCycleShadowParityReport, type ServiceCycleShadowSubscription } from '../src/lib/reports/serviceCycleShadowParity';
import { assertLocalReadOnlyAuditArguments, findLocalSqlitePath, optionValue, readJsonFixture } from './local-audit';

type LegacySelectionFixture = readonly string[];

const PARITY_SUBSCRIPTIONS_SQL = `
SELECT s.id AS subscription_id, s.frequency_days, s.service_cycle_anchor, sh.service_date AS completed_service_date
FROM subscriptions s
LEFT JOIN service_history sh ON sh.subscription_id = s.id AND sh.dispatch_status = 'Completed'
WHERE s.status IN ('active', 'canceled', 'cancelled')
  AND s.frequency_days IN (28, 56, 84)
  AND s.current_period_end > ?
ORDER BY s.id, sh.service_date`;

export function groupParityRows(rows: readonly Record<string, string | number | null>[]): ServiceCycleShadowSubscription[] {
    const subscriptions = new Map<string, ServiceCycleShadowSubscription>();
    for (const row of rows) {
        const subscriptionId = String(row.subscription_id);
        let subscription = subscriptions.get(subscriptionId);
        if (!subscription) {
            subscription = { subscriptionId, frequencyDays: Number(row.frequency_days), serviceCycleAnchor: row.service_cycle_anchor as string | null, completedServiceDates: [] };
            subscriptions.set(subscriptionId, subscription);
        }
        if (row.completed_service_date) (subscription.completedServiceDates as string[]).push(String(row.completed_service_date));
    }
    return [...subscriptions.values()];
}

function main(): void {
    const args = process.argv.slice(2);
    assertLocalReadOnlyAuditArguments(args, ['--db', '--target', '--legacy-selection', '--print-sql']);
    if (args.includes('--print-sql')) { console.log(PARITY_SUBSCRIPTIONS_SQL.trim()); return; }
    const target = optionValue(args, '--target');
    if (!target) throw new Error('--target requires an Eastern canonical date (YYYY-MM-DD).');
    const legacySelectedSubscriptionIds = readJsonFixture<LegacySelectionFixture>(optionValue(args, '--legacy-selection'), 'Legacy selection fixture');
    if (!legacySelectedSubscriptionIds || !Array.isArray(legacySelectedSubscriptionIds) || !legacySelectedSubscriptionIds.every((id) => typeof id === 'string')) {
        throw new Error('--legacy-selection must name a JSON array of PII-free subscription identifiers.');
    }
    const db = new Database(findLocalSqlitePath(optionValue(args, '--db')), { readonly: true, fileMustExist: true });
    const subscriptions = groupParityRows(db.prepare(PARITY_SUBSCRIPTIONS_SQL).all(`${target}T00:00:00.000Z`) as Array<Record<string, string | number | null>>);
    console.log(JSON.stringify({ source: 'local_sqlite', report: buildCycleShadowParityReport({ targetCycleDueDate: target, legacySelectedSubscriptionIds, subscriptions }) }, null, 2));
}

try { main(); } catch (error) { console.error(error instanceof Error ? error.message : 'Local audit failed.'); process.exit(1); }
