import Database from 'better-sqlite3';
import {
    buildConfirmedRecoveryPreflightReport,
    readConfirmedRecoveryPreflightFixture,
    type ConfirmedRecoveryPreflightFixture,
} from '../src/lib/recovery/confirmedAffectedSubscriptionsPreflight';
import type { ConfirmedRecoveryBeforeState } from '../src/lib/recovery/confirmedAffectedSubscriptionsRecovery';
import { assertLocalReadOnlyAuditArguments, findLocalSqlitePath, optionValue, readJsonFixture } from './local-audit';

const ALLOWED_OPTIONS = [
    '--db', '--fixture', '--as-field-evidence',
    '--mz-subscription-id', '--mz-allowlisted-subscription-id',
    '--mb-subscription-id', '--mb-allowlisted-subscription-id',
    '--as-subscription-id', '--as-allowlisted-subscription-id',
] as const;

function required(args: readonly string[], name: string): string {
    const value = optionValue(args, name);
    if (!value) throw new Error(`Missing ${name}.`);
    return value;
}

function main(): void {
    const args = process.argv.slice(2);
    assertLocalReadOnlyAuditArguments(args, ALLOWED_OPTIONS);
    const identities = {
        mz: { subscriptionId: required(args, '--mz-subscription-id'), allowlistedSubscriptionId: required(args, '--mz-allowlisted-subscription-id') },
        mb: { subscriptionId: required(args, '--mb-subscription-id'), allowlistedSubscriptionId: required(args, '--mb-allowlisted-subscription-id') },
        as: { subscriptionId: required(args, '--as-subscription-id'), allowlistedSubscriptionId: required(args, '--as-allowlisted-subscription-id') },
    };
    const fixturePath = optionValue(args, '--fixture');
    if (fixturePath && optionValue(args, '--db')) throw new Error('Choose either --fixture or --db, not both.');
    const fixture = fixturePath
        ? readJsonFixture<ConfirmedRecoveryPreflightFixture>(fixturePath, 'Confirmed recovery preflight fixture')!
        : readConfirmedRecoveryPreflightFixture(
            new Database(findLocalSqlitePath(optionValue(args, '--db')), { readonly: true, fileMustExist: true }),
            identities,
            readJsonFixture<ConfirmedRecoveryBeforeState['fieldCleaningEvidence']>(optionValue(args, '--as-field-evidence'), 'A.S. field-evidence reference'),
        );
    console.log(JSON.stringify({ source: fixturePath ? 'fixture' : 'local_sqlite', ...buildConfirmedRecoveryPreflightReport(identities, fixture) }, null, 2));
}

try { main(); } catch (error) { console.error(error instanceof Error ? error.message : 'Confirmed recovery preflight failed.'); process.exit(1); }
