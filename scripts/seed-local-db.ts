import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SEED_SALES_REPS = [
    { id: 'EYANNI', email: 'admin@example.com', can_override_fee: 1, is_admin: 1, is_active: 1 },
    { id: 'DRIVER2', email: 'driver2@example.com', can_override_fee: 0, is_admin: 1, is_active: 1 },
    { id: 'REP123', email: 'rep123@example.com', can_override_fee: 1, is_admin: 0, is_active: 1 },
];

const SEED_CUSTOMERS: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    bin_quantity: number;
    sales_rep_id: string;
    address: { raw_address: string; service_day: string; notes: string; latitude: number | null; longitude: number | null; scent_preference: string };
    subscription: { status: string; frequency_days: number };
}[] = [
    {
        id: '40000000-0000-0000-0000-000000000001',
        email: 'john.doe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        phone_number: '(910) 555-0101',
        bin_quantity: 2,
        sales_rep_id: 'REP123',
        address: {
            raw_address: '1428 Elm St, Wilmington, NC 28401',
            service_day: 'MON',
            notes: 'Gate code: 1234. Leave bins inside gate.',
            latitude: 34.2361,
            longitude: -77.9447,
            scent_preference: 'lavender',
        },
        subscription: { status: 'active', frequency_days: 28 },
    },
    {
        id: '40000000-0000-0000-0000-000000000002',
        email: 'jane.smith@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        phone_number: '(910) 555-0102',
        bin_quantity: 1,
        sales_rep_id: 'EYANNI',
        address: {
            raw_address: '2560 Market St, Wilmington, NC 28403',
            service_day: 'MON',
            notes: '',
            latitude: 34.2383,
            longitude: -77.9182,
            scent_preference: 'ocean_breeze',
        },
        subscription: { status: 'active', frequency_days: 28 },
    },
    {
        id: '40000000-0000-0000-0000-000000000003',
        email: 'bob.wilson@example.com',
        first_name: 'Bob',
        last_name: 'Wilson',
        phone_number: '(910) 555-0103',
        bin_quantity: 3,
        sales_rep_id: 'REP123',
        address: {
            raw_address: '3501 Wrightsville Ave, Wilmington, NC 28403',
            service_day: 'TUE',
            notes: 'Dog in backyard — knock loudly',
            latitude: 34.2204,
            longitude: -77.8995,
            scent_preference: 'tropical',
        },
        subscription: { status: 'active', frequency_days: 84 },
    },
    {
        id: '40000000-0000-0000-0000-000000000004',
        email: 'alice.johnson@example.com',
        first_name: 'Alice',
        last_name: 'Johnson',
        phone_number: '(910) 555-0104',
        bin_quantity: 1,
        sales_rep_id: 'EYANNI',
        address: {
            raw_address: '4701 Oleander Dr, Wilmington, NC 28403',
            service_day: 'WED',
            notes: '',
            latitude: 34.2091,
            longitude: -77.8836,
            scent_preference: 'lavender',
        },
        subscription: { status: 'canceled', frequency_days: 28 },
    },
    {
        id: '40000000-0000-0000-0000-000000000005',
        email: 'charlie.brown@example.com',
        first_name: 'Charlie',
        last_name: 'Brown',
        phone_number: '(910) 555-0105',
        bin_quantity: 2,
        sales_rep_id: 'REP123',
        address: {
            raw_address: '5902 Carolina Beach Rd, Wilmington, NC 28412',
            service_day: 'THU',
            notes: 'Prefers bins placed on side of driveway',
            latitude: null,
            longitude: null,
            scent_preference: 'ocean_breeze',
        },
        subscription: { status: 'incomplete', frequency_days: 28 },
    },
    {
        id: '40000000-0000-0000-0000-000000000006',
        email: 'diana.ross@example.com',
        first_name: 'Diana',
        last_name: 'Ross',
        phone_number: '(910) 555-0106',
        bin_quantity: 4,
        sales_rep_id: 'EYANNI',
        address: {
            raw_address: '6201 Oleander Dr, Wilmington, NC 28403',
            service_day: 'FRI',
            notes: '',
            latitude: 34.2105,
            longitude: -77.8412,
            scent_preference: 'tropical',
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
                `UPDATE sales_reps SET email = '${rep.email}', can_override_fee = ${rep.can_override_fee}, is_admin = ${rep.is_admin}, is_active = ${rep.is_active} WHERE id = '${rep.id}'`
            );
            console.log(`  UPDATE sales_rep ${rep.id} — email=${rep.email}, is_admin=${rep.is_admin}`);
            updated++;
        } else {
            runDb(
                `INSERT INTO sales_reps (id, email, can_override_fee, is_admin, is_active) VALUES ('${rep.id}', '${rep.email}', ${rep.can_override_fee}, ${rep.is_admin}, ${rep.is_active})`
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
            const sql = `UPDATE customers SET email='${c.email}', first_name='${c.first_name}', last_name='${c.last_name}', phone_number='${c.phone_number}', bin_quantity=${c.bin_quantity}, sales_rep_id='${c.sales_rep_id}' WHERE id='${c.id}'`;
            runDb(sql);
            console.log(`  UPDATE customer ${c.id} — ${c.first_name} ${c.last_name}`);
            updated++;
        } else {
            const sql = `INSERT INTO customers (id, email, first_name, last_name, phone_number, bin_quantity, sales_rep_id, created_at) VALUES ('${c.id}', '${c.email}', '${c.first_name}', '${c.last_name}', '${c.phone_number}', ${c.bin_quantity}, '${c.sales_rep_id}', datetime('now', '-${SEED_CUSTOMERS.indexOf(c)} days'))`;
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
            const sql = `UPDATE addresses SET raw_address='${c.address.raw_address.replace(/'/g, "''")}', latitude=${c.address.latitude ?? 'NULL'}, longitude=${c.address.longitude ?? 'NULL'}, service_day='${c.address.service_day}', notes='${c.address.notes.replace(/'/g, "''")}', scent_preference='${c.address.scent_preference}' WHERE customer_id='${c.id}'`;
            runDb(sql);
            console.log(`  UPDATE address ${existing[0].id} — ${c.address.raw_address}`);
            updated++;
        } else {
            const sql = `INSERT INTO addresses (id, customer_id, raw_address, latitude, longitude, service_day, notes, scent_preference, created_at) VALUES ('${addrId}', '${c.id}', '${c.address.raw_address.replace(/'/g, "''")}', ${c.address.latitude ?? 'NULL'}, ${c.address.longitude ?? 'NULL'}, '${c.address.service_day}', '${c.address.notes.replace(/'/g, "''")}', '${c.address.scent_preference}', datetime('now', '-${SEED_CUSTOMERS.indexOf(c)} days'))`;
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

function sqlQuote(value: string): string {
    return value.replace(/'/g, "''");
}

function seedDispatchSettings() {
    const settings = [
        ['default_driver_sales_rep_id', 'EYANNI'],
        ['route_depot_address', 'Wilmington, NC'],
        ['route_depot_lat', '34.2257'],
        ['route_depot_lng', '-77.9447'],
    ];

    for (const [key, value] of settings) {
        runDb(`INSERT INTO global_settings (key, value) VALUES ('${key}', '${value}') ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`);
    }

    console.log('  SEED  dispatch settings — default driver EYANNI, Wilmington depot');
}

function seedDispatchRoutes() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().split('T')[0];

    runDb(`DELETE FROM dispatch_stops WHERE id LIKE 'seed_dispatch_%'`);
    runDb(`DELETE FROM service_history WHERE id LIKE 'seed_history_%'`);

    const routeCustomers = [SEED_CUSTOMERS[0], SEED_CUSTOMERS[1], SEED_CUSTOMERS[4], SEED_CUSTOMERS[3], SEED_CUSTOMERS[2]];
    routeCustomers.forEach((customer, index) => {
        const serviceDate = index < 3 ? today : tomorrow;
        const historyId = `seed_history_${index + 1}`;
        const stopId = `seed_dispatch_${index + 1}`;
        const subscriptionId = `60000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`;
        const status = index === 3 ? 'completed' : index === 4 ? 'skipped' : 'assigned';
        const historyStatus = status === 'completed' ? 'Completed' : status === 'skipped' ? 'Skipped' : 'Pending';
        const completedAt = status === 'completed' ? `datetime('now', '-2 hours')` : 'NULL';
        const skipReason = status === 'skipped' ? "'Customer gate locked'" : 'NULL';

        runDb(
            `INSERT INTO service_history (id, subscription_id, service_date, dispatch_status, bin_quantity)
             VALUES ('${historyId}', '${subscriptionId}', '${serviceDate}', '${historyStatus}', ${customer.bin_quantity})`
        );

        runDb(
            `INSERT INTO dispatch_stops (
                id, subscription_id, service_history_id, service_date, driver_sales_rep_id,
                route_sequence_order, dispatch_status, customer_name, raw_address, latitude,
                longitude, bin_count, customer_scent, service_notes, customer_phone,
                skip_reason, completed_at, updated_by_sales_rep_id
             ) VALUES (
                '${stopId}', '${subscriptionId}', '${historyId}', '${serviceDate}', 'EYANNI',
                ${index + 1}, '${status}', '${sqlQuote(`${customer.first_name} ${customer.last_name}`)}',
                '${sqlQuote(customer.address.raw_address)}', ${customer.address.latitude ?? 'NULL'},
                ${customer.address.longitude ?? 'NULL'}, ${customer.bin_quantity},
                '${customer.address.scent_preference}', ${customer.address.notes ? `'${sqlQuote(customer.address.notes)}'` : 'NULL'},
                ${index === 2 ? 'NULL' : `'${customer.phone_number}'`}, ${skipReason}, ${completedAt}, ${status === 'assigned' ? 'NULL' : "'EYANNI'"}
             )`
        );
    });

    console.log(`  SEED  dispatch routes — active today/tomorrow routes for EYANNI`);
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

    console.log('--- Dispatch Settings ---');
    seedDispatchSettings();
    console.log('');

    console.log('--- Dispatch Routes ---');
    seedDispatchRoutes();
    console.log('');

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
