import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export function getDbPath(): string {
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
        // If wrangler hasn't started miniflare yet, we might not have a database file.
        // We will fallback to a predicted name or wait.
        throw new Error('Database file not found in ' + dir + '. Please make sure the wrangler/miniflare dev environment has run.');
    }
    return path.join(dir, dbFiles[0].name);
}

export function queryDb<T = any>(sql: string): T[] {
    const dbPath = getDbPath();
    try {
        const output = execSync(`sqlite3 ${dbPath} -json ${JSON.stringify(sql)}`, { encoding: 'utf-8' });
        return output ? JSON.parse(output.trim()) : [];
    } catch (e) {
        console.error('SQL query failed:', sql, e);
        return [];
    }
}

export function runDb(sql: string): void {
    const dbPath = getDbPath();
    try {
        execSync(`sqlite3 ${dbPath} ${JSON.stringify('PRAGMA busy_timeout = 10000; ' + sql)}`);
    } catch (e) {
        console.error('SQL execution failed:', sql, e);
        throw e;
    }
}

export function cleanTestRecords() {
    const testEmails = ["organic@example.com", "d2d@example.com", "test@example.com", "vacation@example.com", "user@example.com"];
    const emailList = testEmails.map(e => `'${e}'`).join(',');
    
    // Find customer IDs first
    const customers = queryDb<{ id: string }>(`SELECT id FROM customers WHERE email IN (${emailList})`);
    const customerIds = customers.map(c => `'${c.id}'`).join(',');
    
    if (customerIds) {
        runDb(`DELETE FROM service_history WHERE customer_id IN (${customerIds})`);
        runDb(`DELETE FROM pending_dispatches WHERE customer_id IN (${customerIds})`);
        runDb(`DELETE FROM subscriptions WHERE customer_id IN (${customerIds})`);
        runDb(`DELETE FROM accounts WHERE userId IN (${customerIds})`);
        runDb(`DELETE FROM sessions WHERE userId IN (${customerIds})`);
        runDb(`DELETE FROM customers WHERE id IN (${customerIds})`);
        runDb(`DELETE FROM addresses WHERE customer_id IN (${customerIds})`);
    }
    
    // Delete other potential records
    runDb(`DELETE FROM leads WHERE email IN (${emailList})`);
    runDb(`DELETE FROM verification_tokens WHERE identifier IN (${emailList})`);
}
