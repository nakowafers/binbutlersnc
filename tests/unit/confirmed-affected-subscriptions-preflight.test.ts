import { describe, expect, it } from 'vitest';
import { buildConfirmedAffectedSubscriptionsRecoveryPlan } from '@/lib/recovery/confirmedAffectedSubscriptionsRecovery';
import {
    buildConfirmedRecoveryPreflightReport,
    readConfirmedRecoveryPreflightFixture,
    type ConfirmedRecoveryPreflightFacts,
} from '@/lib/recovery/confirmedAffectedSubscriptionsPreflight';
import { DbSimulator } from '../integration/db-simulator';

const identities = {
    mz: { subscriptionId: 'sub_mz', allowlistedSubscriptionId: 'sub_mz' },
    mb: { subscriptionId: 'sub_mb', allowlistedSubscriptionId: 'sub_mb' },
    as: { subscriptionId: 'sub_as', allowlistedSubscriptionId: 'sub_as' },
};

function matchingFacts() {
    const plan = buildConfirmedAffectedSubscriptionsRecoveryPlan(identities);
    return Object.fromEntries(plan.operations.map((operation) => [operation.case, {
        ...operation.expectedBefore,
        subscriptionStatus: 'active',
        recoveryReview: null,
    } satisfies ConfirmedRecoveryPreflightFacts])) as Record<(typeof plan.operations)[number]['case'], ConfirmedRecoveryPreflightFacts>;
}

describe('confirmed affected subscriptions operational preflight', () => {
    it('emits PII-free machine-readable recommendations from fixtures', () => {
        const report = buildConfirmedRecoveryPreflightReport(identities, { facts: matchingFacts() });

        expect(report).toMatchObject({ mode: 'read_only', productionMutationAuthorized: false, piiFree: true, allCasesReady: true });
        expect(report.cases.map(({ case: recoveryCase, recommendation }) => [recoveryCase, recommendation])).toEqual([
            ['mz_catch_up', 'ready_for_separately_authorized_recovery'],
            ['mb_protected_route', 'verified_no_write_required'],
            ['as_anchor_finalization', 'ready_for_separately_authorized_recovery'],
        ]);
        expect(JSON.stringify(report)).not.toMatch(/email|raw_address|customer_name|stripe_/i);
    });

    it('keeps A.S. in review when field evidence is unavailable', () => {
        const facts = matchingFacts();
        facts.as_anchor_finalization = { ...facts.as_anchor_finalization, fieldCleaningEvidence: null };

        const report = buildConfirmedRecoveryPreflightReport(identities, { facts });

        expect(report.allCasesReady).toBe(false);
        expect(report.cases.find(({ case: recoveryCase }) => recoveryCase === 'as_anchor_finalization')?.recommendation)
            .toBe('keep_needs_review_no_write');
    });

    it('sanitizes fixture objects and rejects non-opaque evidence references', () => {
        const facts = matchingFacts();
        facts.as_anchor_finalization = {
            ...facts.as_anchor_finalization,
            fieldCleaningEvidence: { attested: true, reference: 'customer@example.test', contradictory: false },
            customerEmail: 'customer@example.test',
        } as ConfirmedRecoveryPreflightFacts;

        const report = buildConfirmedRecoveryPreflightReport(identities, { facts });

        expect(report.cases.find(({ case: recoveryCase }) => recoveryCase === 'as_anchor_finalization')).toMatchObject({
            recommendation: 'keep_needs_review_no_write',
            facts: { fieldCleaningEvidence: { attested: false, reference: null, contradictory: true } },
        });
        expect(JSON.stringify(report)).not.toContain('customer@example.test');
    });

    it('reads allowlisted recovery facts from local SQLite without selecting customer PII', () => {
        const simulator = new DbSimulator();
        simulator.db.exec(`
            INSERT INTO customers (id, email) VALUES ('customer_mz', 'mz@example.test'), ('customer_mb', 'mb@example.test'), ('customer_as', 'as@example.test');
            INSERT INTO addresses (id, customer_id, raw_address, trash_day, service_day) VALUES
                ('address_mz', 'customer_mz', 'private-mz', 'WED', 'WED'),
                ('address_mb', 'customer_mb', 'private-mb', 'MON', 'MON'),
                ('address_as', 'customer_as', 'private-as', 'MON', 'MON');
            UPDATE customers SET address_id = 'address_mz' WHERE id = 'customer_mz';
            UPDATE customers SET address_id = 'address_mb' WHERE id = 'customer_mb';
            UPDATE customers SET address_id = 'address_as' WHERE id = 'customer_as';
            INSERT INTO subscriptions (id, customer_id, status, frequency_days, service_cycle_anchor) VALUES
                ('sub_mz', 'customer_mz', 'active', 28, '2026-08-26'),
                ('sub_mb', 'customer_mb', 'active', 28, '2026-08-31'),
                ('sub_as', 'customer_as', 'active', 28, NULL);
            INSERT INTO service_cycles (id, subscription_id, cycle_due_date, state) VALUES
                ('cycle_mz_missed', 'sub_mz', '2026-08-26', 'exception'),
                ('cycle_mz_next', 'sub_mz', '2026-09-23', 'open');
            INSERT INTO service_history (id, subscription_id, service_cycle_id, cycle_due_date, service_date, dispatch_status)
                VALUES ('history_mz', 'sub_mz', 'cycle_mz_missed', '2026-08-26', '2026-08-26', 'Skipped');
            INSERT INTO dispatch_stops (id, subscription_id, service_history_id, service_cycle_id, cycle_due_date, service_date, driver_sales_rep_id, dispatch_status, raw_address)
                VALUES ('stop_mz', 'sub_mz', 'history_mz', 'cycle_mz_missed', '2026-08-26', '2026-08-26', 'driver', 'skipped', 'private-mz');
        `);

        const fixture = readConfirmedRecoveryPreflightFixture(simulator.db, identities, null);

        expect(fixture.facts.mz_catch_up).toMatchObject({
            subscriptionStatus: 'active', serviceCycleAnchor: '2026-08-26', serviceDay: 'WED',
            counts: { cycles: 2, attempts: 1, stops: 1, correctionEvents: 0 },
        });
        expect(JSON.stringify(fixture)).not.toContain('private-mz');
        expect(JSON.stringify(fixture)).not.toContain('@example.test');
    });
});
