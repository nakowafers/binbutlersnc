import {
    buildConfirmedAffectedSubscriptionsRecoveryPlan,
    type ConfirmedRecoveryBeforeState,
    type OpaqueRecoveryIdentity,
    type RecoveryCase,
} from './confirmedAffectedSubscriptionsRecovery';

export interface ConfirmedRecoveryPreflightFacts extends ConfirmedRecoveryBeforeState {
    subscriptionStatus: string | null;
    recoveryReview: { classification: 'needs_review'; reason: string } | null;
}

export interface ConfirmedRecoveryPreflightFixture {
    facts: Record<RecoveryCase, ConfirmedRecoveryPreflightFacts>;
}

export interface ConfirmedRecoveryPreflightCaseReport {
    case: RecoveryCase;
    subscriptionId: string;
    facts: ConfirmedRecoveryPreflightFacts;
    expectedBeforeMatches: boolean;
    recommendation:
        | 'ready_for_separately_authorized_recovery'
        | 'verified_no_write_required'
        | 'keep_needs_review_no_write'
        | 'stop_subscription_not_found'
        | 'stop_before_state_mismatch';
}

export interface ConfirmedRecoveryPreflightReport {
    mode: 'read_only';
    productionMutationAuthorized: false;
    piiFree: true;
    allCasesReady: boolean;
    cases: ConfirmedRecoveryPreflightCaseReport[];
}

export interface ReadOnlyConfirmedRecoverySqlite {
    prepare(sql: string): {
        all(...params: unknown[]): unknown[];
    };
}

type Identities = { mz: OpaqueRecoveryIdentity; mb: OpaqueRecoveryIdentity; as: OpaqueRecoveryIdentity };

const CASE_DATES: Record<RecoveryCase, readonly string[]> = {
    mz_catch_up: ['2026-08-26', '2026-09-02', '2026-09-23'],
    mb_protected_route: ['2026-08-31'],
    as_anchor_finalization: ['2026-08-27', '2026-09-28'],
};

function same(actual: unknown, expected: unknown): boolean {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

function snapshot(facts: ConfirmedRecoveryPreflightFacts): ConfirmedRecoveryBeforeState {
    return {
        identity: facts.identity,
        serviceCycleAnchor: facts.serviceCycleAnchor,
        serviceDay: facts.serviceDay,
        counts: facts.counts,
        cycles: facts.cycles,
        attempts: facts.attempts,
        stops: facts.stops,
        fieldCleaningEvidence: facts.fieldCleaningEvidence,
    };
}

function sanitizeFacts(facts: ConfirmedRecoveryPreflightFacts): ConfirmedRecoveryPreflightFacts {
    const evidence = facts.fieldCleaningEvidence;
    const reference = evidence?.reference && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(evidence.reference)
        ? evidence.reference
        : null;
    return {
        identity: { subscriptionId: facts.identity.subscriptionId, allowlistedSubscriptionId: facts.identity.allowlistedSubscriptionId },
        subscriptionStatus: facts.subscriptionStatus,
        serviceCycleAnchor: facts.serviceCycleAnchor,
        serviceDay: facts.serviceDay,
        recoveryReview: facts.recoveryReview ? { classification: 'needs_review', reason: facts.recoveryReview.reason } : null,
        counts: { ...facts.counts },
        cycles: facts.cycles.map(({ dueDate, state }) => ({ dueDate, state })),
        attempts: facts.attempts.map(({ serviceDate, cycleDueDate, state, completedAt }) => ({ serviceDate, cycleDueDate, state, completedAt })),
        stops: facts.stops.map(({ serviceDate, cycleDueDate, state }) => ({ serviceDate, cycleDueDate, state })),
        fieldCleaningEvidence: evidence ? {
            attested: evidence.attested && reference !== null,
            reference,
            contradictory: evidence.contradictory || reference === null,
        } : null,
    };
}

function matchesExpectedBefore(facts: ConfirmedRecoveryPreflightFacts, expected: ConfirmedRecoveryBeforeState): boolean {
    const actual = snapshot(facts);
    const evidenceMatches = expected.fieldCleaningEvidence === null
        || (actual.fieldCleaningEvidence?.attested === true
            && actual.fieldCleaningEvidence.reference !== null
            && actual.fieldCleaningEvidence.contradictory === false);
    return evidenceMatches && same(
        { ...actual, fieldCleaningEvidence: null },
        { ...expected, fieldCleaningEvidence: null },
    );
}

export function buildConfirmedRecoveryPreflightReport(
    identities: Identities,
    fixture: ConfirmedRecoveryPreflightFixture,
): ConfirmedRecoveryPreflightReport {
    const plan = buildConfirmedAffectedSubscriptionsRecoveryPlan(identities);
    const cases = plan.operations.map((operation): ConfirmedRecoveryPreflightCaseReport => {
        const facts = sanitizeFacts(fixture.facts[operation.case]);
        const expectedBeforeMatches = matchesExpectedBefore(facts, operation.expectedBefore);
        let recommendation: ConfirmedRecoveryPreflightCaseReport['recommendation'];
        if (facts.subscriptionStatus === null) recommendation = 'stop_subscription_not_found';
        else if (facts.subscriptionStatus !== 'active') recommendation = 'stop_before_state_mismatch';
        else if (operation.case === 'as_anchor_finalization'
            && (facts.fieldCleaningEvidence?.attested !== true
                || !facts.fieldCleaningEvidence.reference
                || facts.fieldCleaningEvidence.contradictory)) {
            recommendation = 'keep_needs_review_no_write';
        } else if (!expectedBeforeMatches) recommendation = 'stop_before_state_mismatch';
        else if (operation.case === 'mb_protected_route') recommendation = 'verified_no_write_required';
        else recommendation = 'ready_for_separately_authorized_recovery';
        return { case: operation.case, subscriptionId: operation.subscriptionId, facts, expectedBeforeMatches, recommendation };
    });
    return {
        mode: 'read_only',
        productionMutationAuthorized: false,
        piiFree: true,
        allCasesReady: cases.every(({ recommendation }) => recommendation === 'ready_for_separately_authorized_recovery' || recommendation === 'verified_no_write_required'),
        cases,
    };
}

function placeholders(values: readonly unknown[]): string {
    return values.map(() => '?').join(', ');
}

function first(db: ReadOnlyConfirmedRecoverySqlite, sql: string, ...params: unknown[]): unknown {
    return db.prepare(sql).all(...params)[0];
}

export function readConfirmedRecoveryPreflightFixture(
    db: ReadOnlyConfirmedRecoverySqlite,
    identities: Identities,
    asFieldCleaningEvidence: ConfirmedRecoveryBeforeState['fieldCleaningEvidence'],
): ConfirmedRecoveryPreflightFixture {
    // Building the plan first enforces the exact per-customer allowlists.
    const plan = buildConfirmedAffectedSubscriptionsRecoveryPlan(identities);
    const facts = {} as Record<RecoveryCase, ConfirmedRecoveryPreflightFacts>;
    for (const operation of plan.operations) {
        const subscriptionId = operation.subscriptionId;
        const dates = CASE_DATES[operation.case];
        const subscription = first(db, `
            SELECT s.status, s.service_cycle_anchor, a.service_day,
                   review.classification AS review_classification, review.reason AS review_reason
            FROM subscriptions s
            LEFT JOIN customers c ON c.id = s.customer_id
            LEFT JOIN addresses a ON a.id = c.address_id
            LEFT JOIN subscription_recovery_reviews review ON review.subscription_id = s.id
            WHERE s.id = ?
        `, subscriptionId) as Record<string, string | null> | undefined;

        const cycles = db.prepare(`
            SELECT cycle_due_date AS dueDate, state
            FROM service_cycles
            WHERE subscription_id = ? AND cycle_due_date IN (${placeholders(dates)})
            ORDER BY cycle_due_date, id
        `).all(subscriptionId, ...dates) as Array<{ dueDate: string; state: ConfirmedRecoveryBeforeState['cycles'][number]['state'] }>;
        const attempts = db.prepare(`
            SELECT service_date AS serviceDate, cycle_due_date AS cycleDueDate,
                   dispatch_status AS state, completed_at AS completedAt
            FROM service_history
            WHERE subscription_id = ?
              AND (cycle_due_date IN (${placeholders(dates)}) OR substr(service_date, 1, 10) IN (${placeholders(dates)}))
            ORDER BY service_date, id
        `).all(subscriptionId, ...dates, ...dates) as ConfirmedRecoveryBeforeState['attempts'];
        const stops = db.prepare(`
            SELECT service_date AS serviceDate, cycle_due_date AS cycleDueDate, dispatch_status AS state
            FROM dispatch_stops
            WHERE subscription_id = ?
              AND (cycle_due_date IN (${placeholders(dates)}) OR substr(service_date, 1, 10) IN (${placeholders(dates)}))
            ORDER BY service_date, id
        `).all(subscriptionId, ...dates, ...dates) as ConfirmedRecoveryBeforeState['stops'];
        const correctionEvents = (first(db, `
            SELECT count(*) AS count
            FROM service_cycle_events event
            JOIN service_cycles cycle ON cycle.id = event.service_cycle_id
            WHERE cycle.subscription_id = ? AND cycle.cycle_due_date IN (${placeholders(dates)})
              AND event.event_type = 'correction'
        `, subscriptionId, ...dates) as { count: number } | undefined)?.count ?? 0;

        facts[operation.case] = {
            identity: operation.expectedBefore.identity,
            subscriptionStatus: subscription?.status ?? null,
            serviceCycleAnchor: subscription?.service_cycle_anchor ?? null,
            serviceDay: subscription?.service_day ?? null,
            recoveryReview: subscription?.review_classification === 'needs_review'
                ? { classification: 'needs_review', reason: subscription.review_reason! }
                : null,
            counts: { cycles: cycles.length, attempts: attempts.length, stops: stops.length, correctionEvents },
            cycles,
            attempts,
            stops,
            fieldCleaningEvidence: operation.case === 'as_anchor_finalization' ? asFieldCleaningEvidence : null,
        };
    }
    return { facts };
}
