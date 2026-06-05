import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SEED_SALES_REPS = [
    { id: 'EYANNI', can_override_fee: 1 },
    { id: 'REP123', can_override_fee: 1 },
];

function getDbPath(): string {
    const dir = path.join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const files = fs.readdirSync(dir);
    const dbFiles = files
        .filter(f => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
        .map(f => ({
            name: f,
            time: fs.statSync(path.join(dir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

    if (dbFiles.length === 0) {
        throw new Error(
            'D1 database file not found. Make sure wrangler dev has been started at least once.\n' +
            `Expected directory: ${dir}`
        );
    }
    return path.join(dir, dbFiles[0].name);
}

function runDb(sql: string): void {
    const dbPath = getDbPath();
    execSync(`sqlite3 ${dbPath} ${JSON.stringify(sql)}`, { stdio: 'pipe' });
}

function queryDb<T = any>(sql: string): T[] {
    const dbPath = getDbPath();
    const output = execSync(`sqlite3 ${dbPath} -json ${JSON.stringify(sql)}`, { encoding: 'utf-8' });
    return output ? JSON.parse(output.trim()) : [];
}

function seed() {
    console.log('Seeding local D1 database...\n');

    const dbPath = getDbPath();
    console.log(`Database: ${dbPath}\n`);

    let inserted = 0;
    let skipped = 0;

    for (const rep of SEED_SALES_REPS) {
        const existing = queryDb<{ id: string }>(
            `SELECT id FROM sales_reps WHERE id = '${rep.id}'`
        );

        if (existing.length > 0) {
            console.log(`  SKIP  ${rep.id} — already exists`);
            skipped++;
            continue;
        }

        runDb(
            `INSERT INTO sales_reps (id, can_override_fee) VALUES ('${rep.id}', ${rep.can_override_fee})`
        );
        console.log(`  SEED  ${rep.id} — can_override_fee = ${rep.can_override_fee}`);
        inserted++;
    }

    console.log(`\nDone. ${inserted} inserted, ${skipped} already existed.`);
}

try {
    seed();
} catch (e) {
    if (e instanceof Error && e.message.includes('Database file not found')) {
        console.error(
            'Error: No local D1 database found.\n\n' +
            'Start the dev server first (npm run dev), then run this script.\n' +
            'The dev server creates the D1 SQLite file that this script seeds.'
        );
        process.exit(1);
    }
    throw e;
}
