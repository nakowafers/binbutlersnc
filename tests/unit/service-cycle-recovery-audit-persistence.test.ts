import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('local Service Cycle recovery audit persistence', () => {
    let directory: string;
    let databasePath: string;
    let evidencePath: string;

    beforeEach(() => {
        directory = mkdtempSync(join(tmpdir(), 'service-cycle-recovery-audit-'));
        databasePath = join(directory, 'local.sqlite');
        evidencePath = join(directory, 'stripe-evidence.json');
        writeFileSync(evidencePath, '{}');
        const db = new Database(databasePath);
        db.exec(`
            CREATE TABLE customers (id TEXT PRIMARY KEY, address_id TEXT);
            CREATE TABLE addresses (id TEXT PRIMARY KEY, customer_id TEXT, service_day TEXT);
            CREATE TABLE subscriptions (
                id TEXT PRIMARY KEY, customer_id TEXT, stripe_subscription_id TEXT, status TEXT,
                frequency_days INTEGER, current_period_end TEXT, service_cycle_anchor TEXT
            );
            CREATE TABLE service_history (
                id TEXT PRIMARY KEY, subscription_id TEXT, service_date TEXT, dispatch_status TEXT,
                completed_at TEXT, cycle_due_date TEXT, service_cycle_id TEXT
            );
            CREATE TABLE dispatch_stops (
                id TEXT PRIMARY KEY, subscription_id TEXT, service_history_id TEXT, service_date TEXT,
                dispatch_status TEXT, cycle_due_date TEXT, service_cycle_id TEXT
            );
            CREATE TABLE subscription_recovery_reviews (
                subscription_id TEXT PRIMARY KEY, classification TEXT, reason TEXT, observed_at TEXT
            );
            INSERT INTO customers (id, address_id) VALUES ('customer_1', 'address_1');
            INSERT INTO addresses (id, customer_id, service_day) VALUES ('address_1', 'customer_1', 'MON');
            INSERT INTO subscriptions (
                id, customer_id, stripe_subscription_id, status, frequency_days, current_period_end, service_cycle_anchor
            ) VALUES (
                'subscription_1', 'customer_1', 'stripe_subscription_1', 'active', 28,
                '2026-09-28T04:00:00.000Z', NULL
            );
        `);
        db.close();
    });

    afterEach(() => rmSync(directory, { recursive: true, force: true }));

    function runAudit(extraArgs: string[] = []) {
        return spawnSync(process.execPath, [
            'scripts/run-local-audit.mjs',
            'scripts/audit-service-cycle-recovery.ts',
            '--db', databasePath,
            '--stripe-evidence', evidencePath,
            ...extraArgs,
        ], { cwd: process.cwd(), encoding: 'utf8' });
    }

    it('stays read-only by default and persists the same classification only with the explicit local flag', () => {
        const readOnly = runAudit();
        expect(readOnly.status, readOnly.stderr).toBe(0);
        expect(JSON.parse(readOnly.stdout)).toMatchObject({ mode: 'read_only', persistedReviewCount: 0 });

        const db = new Database(databasePath);
        expect(db.prepare('SELECT count(*) AS count FROM subscription_recovery_reviews').get()).toEqual({ count: 0 });
        db.close();

        const persisted = runAudit(['--persist-local-needs-review']);
        expect(persisted.status, persisted.stderr).toBe(0);
        expect(JSON.parse(persisted.stdout)).toMatchObject({ mode: 'persist_local_needs_review', persistedReviewCount: 1 });

        const verified = new Database(databasePath, { readonly: true });
        expect(verified.prepare('SELECT subscription_id, classification, reason FROM subscription_recovery_reviews').get()).toEqual({
            subscription_id: 'subscription_1',
            classification: 'needs_review',
            reason: 'missing_stripe_evidence',
        });
        verified.close();
    });
});
