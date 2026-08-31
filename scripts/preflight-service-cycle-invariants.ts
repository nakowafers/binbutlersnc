import Database from 'better-sqlite3';
import { SERVICE_CYCLE_INVARIANT_AUDIT_SQL, summarizeServiceCycleInvariantAudit, type ServiceCycleInvariantAuditRow } from '../src/lib/reports/serviceCycleInvariantAudit';
import { assertLocalReadOnlyAuditArguments, findLocalSqlitePath, optionValue } from './local-audit';

function main(): void {
    const args = process.argv.slice(2);
    assertLocalReadOnlyAuditArguments(args, ['--db', '--print-sql']);
    if (args.includes('--print-sql')) {
        console.log(SERVICE_CYCLE_INVARIANT_AUDIT_SQL.trim());
        return;
    }
    const db = new Database(findLocalSqlitePath(optionValue(args, '--db')), { readonly: true, fileMustExist: true });
    const rows = db.prepare(SERVICE_CYCLE_INVARIANT_AUDIT_SQL).all() as ServiceCycleInvariantAuditRow[];
    console.log(JSON.stringify({ source: 'local_sqlite', summary: summarizeServiceCycleInvariantAudit(rows), findings: rows }, null, 2));
}

try { main(); } catch (error) { console.error(error instanceof Error ? error.message : 'Local audit failed.'); process.exit(1); }
