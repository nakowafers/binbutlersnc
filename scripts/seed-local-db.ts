import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SEED_SALES_REPS = [
    { id: 'EYANNI', email: 'admin@example.com', can_override_fee: 1, is_admin: 1 },
    { id: 'REP123', email: 'rep123@example.com', can_override_fee: 1, is_admin: 0 },
];

const SEED_CUSTOMERS: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    sales_rep_id: string;
    address: { raw_address: string; service_day: string; notes: string };
    subscription: { status: string; frequency_days: number };
}[] = [
    {
        id: '40000000-0000-0000-0000-000000000001',
        email: 'john.doe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        phone_number: '(910) 555-0101',
        sales_rep_id: 'REP123',
        address: {
            raw_address: '1428 Elm St, Wilmington, NC 28401',
            service_day: 'MON',
            notes: 'Gate code: 1234. Leave bins inside gate.',
        },
        subscription: { status: 'active', frequency_days: 28 },
    },
    {
        id: '40000000-0000-0000-0000-000000000002',
        email: 'jane.smith@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        phone_number: '(910) 555-0102',
        sales_rep_id: 'EYANNI',
        address: {
            raw_address: '2560 Market St, Wilmington, NC 28403',
            service_day: 'MON',
            notes: '',
        },
        subscription: { status: 'active', frequency_days: 28 },
    },
    {
        id: '40000000-0000-0000-0000-000000000003',
        email: 'bob.wilson@example.com',
        first_name: 'Bob',
        last_name: 'Wilson',
        phone_number: '(910) 555-0103',
        sales_rep_id: 'REP123',
        address: {
            raw_address: '3501 Wrightsville Ave, Wilmington, NC 28403',
            service_day: 'TUE',
            notes: 'Dog in backyard — knock loudly',
        },
        subscription: { status: 'active', frequency_days: 84 },
    },
    {
        id: '40000000-0000-0000-0000-000000000004',
        email: 'alice.johnson@example.com',
        first_name: 'Alice',
        last_name: 'Johnson',
        phone_number: '(910) 555-0104',
        sales_rep_id: 'EYANNI',
        address: {
            raw_address: '4701 Oleander Dr, Wilmington, NC 28403',
            service_day: 'WED',
            notes: '',
        },
        subscription: { status: 'canceled', frequency_days: 28 },
    },
    {
        id: '40000000-0000-0000-0000-000000000005',
        email: 'charlie.brown@example.com',
        first_name: 'Charlie',
        last_name: 'Brown',
        phone_number: '(910) 555-0105',
        sales_rep_id: 'REP123',
        address: {
            raw_address: '5902 Carolina Beach Rd, Wilmington, NC 28412',
            service_day: 'THU',
            notes: 'Prefers bins placed on side of driveway',
        },
        subscription: { status: 'incomplete', frequency_days: 28 },
    },
    {
        id: '40000000-0000-0000-0000-000000000006',
        email: 'diana.ross@example.com',
        first_name: 'Diana',
        last_name: 'Ross',
        phone_number: '(910) 555-0106',
        sales_rep_id: 'EYANNI',
        address: {
            raw_address: '6201 Oleander Dr, Wilmington, NC 28403',
            service_day: 'FRI',
            notes: '',
        },
        subscription: { status: 'one-time', frequency_days: 0 },
    },
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

function seedSalesReps() {
    let inserted = 0;
    let updated = 0;

    for (const rep of SEED_SALES_REPS) {
        const existing = queryDb<{ id: string }>(
            `SELECT id FROM sales_reps WHERE id = '${rep.id}'`
        );

        if (existing.length > 0) {
            runDb(
                `UPDATE sales_reps SET email = '${rep.email}', can_override_fee = ${rep.can_override_fee}, is_admin = ${rep.is_admin} WHERE id = '${rep.id}'`
            );
            console.log(`  UPDATE sales_rep ${rep.id} — email=${rep.email}, is_admin=${rep.is_admin}`);
            updated++;
        } else {
            runDb(
                `INSERT INTO sales_reps (id, email, can_override_fee, is_admin) VALUES ('${rep.id}', '${rep.email}', ${rep.can_override_fee}, ${rep.is_admin})`
            );
            console.log(`  SEED  sales_rep ${rep.id} — email=${rep.email}, is_admin=${rep.is_admin}`);
            inserted++;
        }
    }

    return { inserted, updated };
}

function seedCustomers() {
    let inserted = 0;
    let updated = 0;

    for (const c of SEED_CUSTOMERS) {
        const existing = queryDb<{ id: string }>(
            `SELECT id FROM customers WHERE id = '${c.id}'`
        );

        if (existing.length > 0) {
            const sql = `UPDATE customers SET email='${c.email}', first_name='${c.first_name}', last_name='${c.last_name}', phone_number='${c.phone_number}', sales_rep_id='${c.sales_rep_id}' WHERE id='${c.id}'`;
            runDb(sql);
            console.log(`  UPDATE customer ${c.id} — ${c.first_name} ${c.last_name}`);
            updated++;
        } else {
            const sql = `INSERT INTO customers (id, email, first_name, last_name, phone_number, sales_rep_id, created_at) VALUES ('${c.id}', '${c.email}', '${c.first_name}', '${c.last_name}', '${c.phone_number}', '${c.sales_rep_id}', datetime('now', '-${SEED_CUSTOMERS.indexOf(c)} days'))`;
            runDb(sql);
            console.log(`  SEED  customer ${c.id} — ${c.first_name} ${c.last_name} (${c.email})`);
            inserted++;
        }
    }

    return { inserted, updated };
}

function seedAddresses() {
    let inserted = 0;
    let updated = 0;

    for (const c of SEED_CUSTOMERS) {
        const addrId = `50000000-0000-0000-0000-${String(SEED_CUSTOMERS.indexOf(c) + 1).padStart(12, '0')}`;
        const existing = queryDb<{ id: string }>(
            `SELECT id FROM addresses WHERE customer_id = '${c.id}'`
        );

        if (existing.length > 0) {
            const sql = `UPDATE addresses SET raw_address='${c.address.raw_address.replace(/'/g, "''")}', service_day='${c.address.service_day}', notes='${c.address.notes.replace(/'/g, "''")}' WHERE customer_id='${c.id}'`;
            runDb(sql);
            console.log(`  UPDATE address ${existing[0].id} — ${c.address.raw_address}`);
            updated++;
        } else {
            const sql = `INSERT INTO addresses (id, customer_id, raw_address, service_day, notes, created_at) VALUES ('${addrId}', '${c.id}', '${c.address.raw_address.replace(/'/g, "''")}', '${c.address.service_day}', '${c.address.notes.replace(/'/g, "''")}', datetime('now', '-${SEED_CUSTOMERS.indexOf(c)} days'))`;
            runDb(sql);
            console.log(`  SEED  address ${addrId} — ${c.address.raw_address}`);
            inserted++;
        }

        // Link the address to the customer
        runDb(`UPDATE customers SET address_id = '${addrId}' WHERE id = '${c.id}' AND address_id IS NULL`);
    }

    return { inserted, updated };
}

function seedSubscriptions() {
    let inserted = 0;
    let updated = 0;

    for (const c of SEED_CUSTOMERS) {
        const subId = `60000000-0000-0000-0000-${String(SEED_CUSTOMERS.indexOf(c) + 1).padStart(12, '0')}`;
        const existing = queryDb<{ id: string }>(
            `SELECT id FROM subscriptions WHERE customer_id = '${c.id}'`
        );

        if (existing.length > 0) {
            const sql = `UPDATE subscriptions SET status='${c.subscription.status}', frequency_days=${c.subscription.frequency_days} WHERE customer_id='${c.id}'`;
            runDb(sql);
            console.log(`  UPDATE subscription ${existing[0].id} — status=${c.subscription.status}`);
            updated++;
        } else {
            const sql = `INSERT INTO subscriptions (id, customer_id, status, frequency_days, created_at) VALUES ('${subId}', '${c.id}', '${c.subscription.status}', ${c.subscription.frequency_days}, datetime('now', '-${SEED_CUSTOMERS.indexOf(c)} days'))`;
            runDb(sql);
            console.log(`  SEED  subscription ${subId} — customer=${c.id}, status=${c.subscription.status}`);
            inserted++;
        }
    }

    return { inserted, updated };
}


function seed() {
    console.log('Seeding local D1 database...\n');

    console.log('--- Sales Reps ---');
    const reps = seedSalesReps();
    console.log(`  ${reps.inserted} inserted, ${reps.updated} updated\n`);

    console.log('--- Customers ---');
    const customers = seedCustomers();
    console.log(`  ${customers.inserted} inserted, ${customers.updated} updated\n`);

    console.log('--- Addresses ---');
    const addresses = seedAddresses();
    console.log(`  ${addresses.inserted} inserted, ${addresses.updated} updated\n`);

    console.log('--- Subscriptions ---');
    const subs = seedSubscriptions();
    console.log(`  ${subs.inserted} inserted, ${subs.updated} updated\n`);

    console.log('Done.');
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
