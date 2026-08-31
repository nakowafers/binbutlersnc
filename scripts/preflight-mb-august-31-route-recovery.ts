import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const { createMbAugust31RecoveryPlan, preflightMbAugust31RouteRecovery } = await import(
    new URL('../src/lib/recovery/mbAugust31RouteRecovery.ts', import.meta.url).href
);

interface Options { dbPath?: string; subscriptionId: string; allowlistedSubscriptionId: string; driverSalesRepId: string; }

function value(argv: string[], index: number, flag: string): string {
    const result = argv[index];
    if (!result || result.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    return result;
}

function parseArgs(argv: string[]): Options {
    const options: Partial<Options> = {};
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--subscription-id') options.subscriptionId = value(argv, ++index, arg);
        else if (arg === '--allowlisted-subscription-id') options.allowlistedSubscriptionId = value(argv, ++index, arg);
        else if (arg === '--driver-sales-rep-id') options.driverSalesRepId = value(argv, ++index, arg);
        else if (arg === '--db') options.dbPath = value(argv, ++index, arg);
        else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node --experimental-strip-types scripts/preflight-mb-august-31-route-recovery.ts --subscription-id ID --allowlisted-subscription-id ID --driver-sales-rep-id ID [--db PATH]');
            process.exit(0);
        } else throw new Error(`Unknown argument: ${arg}`);
    }
    if (!options.subscriptionId || !options.allowlistedSubscriptionId || !options.driverSalesRepId) throw new Error('Subscription, allowlist, and driver identities are required.');
    return options as Options;
}

function localD1Path(): string {
    const directory = path.join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
    const file = fs.existsSync(directory) && fs.readdirSync(directory).filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite').sort().at(-1);
    if (!file) throw new Error('No local D1 SQLite file found; pass --db for a read-only local database.');
    return path.join(directory, file);
}

function readonlyDb(dbPath: string): D1Database {
    const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
    return { prepare(query: string) {
        const statement = sqlite.prepare(query);
        let args: unknown[] = [];
        return { bind(...nextArgs: unknown[]) { args = nextArgs; return this; }, async first<T>() { return (statement.all(...args)[0] ?? null) as T | null; } } as unknown as D1PreparedStatement;
    } } as D1Database;
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const plan = createMbAugust31RecoveryPlan({
        subscriptionId: options.subscriptionId, allowlistedSubscriptionId: options.allowlistedSubscriptionId,
        driverSalesRepId: options.driverSalesRepId, cycleId: 'preflight-cycle-identity', historyId: 'preflight-history-identity',
        stopId: 'preflight-stop-identity', eventId: 'preflight-event-identity', routeSequenceOrder: 1, occurredAt: new Date().toISOString(),
    });
    console.log(JSON.stringify(await preflightMbAugust31RouteRecovery(readonlyDb(options.dbPath || localD1Path()), plan), null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
