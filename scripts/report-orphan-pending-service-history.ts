import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { OrphanPendingServiceHistoryAuditRow } from '../src/lib/reports/orphanPendingServiceHistoryAudit';

const {
    buildOrphanPendingAuditReportSql,
    getOrphanPendingServiceHistoryAuditReport,
    getTodayDateString,
} = await import(new URL('../src/lib/reports/orphanPendingServiceHistoryAudit.ts', import.meta.url).href);

type OutputFormat = 'json' | 'table';

interface CliOptions {
    dbPath?: string;
    targetServiceDate: string;
    format: OutputFormat;
    printSql: boolean;
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        targetServiceDate: getTodayDateString(),
        format: 'table',
        printSql: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--target-service-date') {
            options.targetServiceDate = readValue(argv, ++i, arg);
        } else if (arg === '--db') {
            options.dbPath = readValue(argv, ++i, arg);
        } else if (arg === '--format') {
            const format = readValue(argv, ++i, arg);
            if (format !== 'json' && format !== 'table') {
                throw new Error('--format must be "json" or "table".');
            }
            options.format = format;
        } else if (arg === '--print-sql') {
            options.printSql = true;
        } else if (arg === '--help' || arg === '-h') {
            printHelp();
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function readValue(argv: string[], index: number, flag: string): string {
    const value = argv[index];
    if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.`);
    }
    return value;
}

function findLocalD1Path(): string {
    const dir = path.join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
    if (!fs.existsSync(dir)) {
        throw new Error(`Local D1 directory not found: ${dir}`);
    }

    const dbFiles = fs.readdirSync(dir)
        .filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite')
        .map((file) => ({
            name: file,
            time: fs.statSync(path.join(dir, file)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

    if (dbFiles.length === 0) {
        throw new Error(`No local D1 SQLite file found in ${dir}`);
    }

    return path.join(dir, dbFiles[0].name);
}

function openReadonlyD1(dbPath: string): D1Database {
    const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
    return {
        prepare(query: string) {
            const statement = sqlite.prepare(query);
            let boundArgs: unknown[] = [];
            return {
                bind(...args: unknown[]) {
                    boundArgs = args;
                    return this;
                },
                async all<T>() {
                    return { results: statement.all(...boundArgs) as T[] };
                },
            } as unknown as D1PreparedStatement;
        },
    } as D1Database;
}

function printRows(rows: OrphanPendingServiceHistoryAuditRow[], format: OutputFormat): void {
    if (format === 'json') {
        console.log(JSON.stringify(rows, null, 2));
        return;
    }

    console.table(rows.map((row) => ({
        route_blocking: row.route_blocking,
        service_history_id: row.service_history_id,
        service_date: row.service_history_service_date,
        customer: row.customer_name || row.customer_email,
        email: row.customer_email,
        subscription_id: row.subscription_id,
        subscription_status: row.subscription_status,
        service_day: row.service_day,
        first_service_date: row.first_service_date,
        latest_completed_service_date: row.latest_completed_service_date,
    })));
}

function printHelp(): void {
    console.log(`Usage: npm run report:orphan-pending-service-history -- [options]

Options:
  --target-service-date YYYY-MM-DD  Target Service Date for route_blocking classification. Defaults to today.
  --db PATH                         Local D1 SQLite file. Defaults to the newest Wrangler local D1 database.
  --format table|json               Output format. Defaults to table.
  --print-sql                       Print the read-only SQL for remote D1 execution instead of opening local D1.
  --help                            Show this help.
`);
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));

    if (options.printSql) {
        console.log(buildOrphanPendingAuditReportSql(options.targetServiceDate).trim());
        return;
    }

    const dbPath = options.dbPath || findLocalD1Path();
    const db = openReadonlyD1(dbPath);
    const rows = await getOrphanPendingServiceHistoryAuditReport(db, options.targetServiceDate);
    printRows(rows, options.format);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
