import { assertEasternServiceDate } from '@/lib/service-cycle/dates';

/**
 * Ticket 11's recovery cases are intentionally represented by opaque IDs only.
 * The operator resolves identities outside this module; customer names, addresses,
 * emails, Stripe Price IDs, and field-evidence contents never enter routine output.
 */
export const CONFIRMED_RECOVERY_DATES = {
    mz: { originalDueDate: '2026-08-26', catchUpServiceDate: '2026-09-02', nextNormalDueDate: '2026-09-23' },
    mb: { normalDueDate: '2026-08-31' },
    as: { fieldCleaningDate: '2026-08-27', firstNormalMondayAnchor: '2026-09-28' },
} as const;

export type RecoveryCase = 'mz_catch_up' | 'mb_protected_route' | 'as_anchor_finalization';
export type CycleState = 'open' | 'exception' | 'fulfilled' | 'waived';
export type AttemptState = 'Pending' | 'Completed' | 'Skipped';

export interface OpaqueRecoveryIdentity {
    subscriptionId: string;
    /** Must exactly equal subscriptionId. This prevents a broad or inferred allowlist. */
    allowlistedSubscriptionId: string;
}

export interface RowCounts {
    cycles: number;
    attempts: number;
    stops: number;
    correctionEvents: number;
}

export interface CycleSnapshot { dueDate: string; state: CycleState; }
export interface AttemptSnapshot { serviceDate: string; cycleDueDate: string; state: AttemptState; completedAt: string | null; }
export interface StopSnapshot { serviceDate: string; cycleDueDate: string; state: 'assigned' | 'completed' | 'skipped'; }

/** PII-free read model populated by a read-only, allowlisted query. */
export interface ConfirmedRecoveryBeforeState {
    identity: OpaqueRecoveryIdentity;
    serviceCycleAnchor: string | null;
    serviceDay: string | null;
    counts: RowCounts;
    cycles: readonly CycleSnapshot[];
    attempts: readonly AttemptSnapshot[];
    stops: readonly StopSnapshot[];
    /** A reference, not the evidence text or an uploaded field artifact. */
    fieldCleaningEvidence: { attested: boolean; reference: string | null; contradictory: boolean } | null;
}

export interface RecoveryOperation {
    case: RecoveryCase;
    kind: 'approve_catch_up' | 'verify_protected_route' | 'normalize_confirmed_cleaning_and_anchor';
    subscriptionId: string;
    expectedBefore: ConfirmedRecoveryBeforeState;
    expectedAfter: Omit<ConfirmedRecoveryBeforeState, 'identity' | 'fieldCleaningEvidence'>;
    appendOnlyEvidence: { eventType: 'transition' | 'correction'; reason: 'data_integrity'; correlationKey: string } | null;
    inverseRepair: { kind: 'manual_audited_correction'; retainAppendOnlyEvidence: true; steps: readonly string[] };
}

export interface ConfirmedRecoveryPlan {
    mode: 'dry_run';
    stripeMutation: 'prohibited';
    operations: readonly RecoveryOperation[];
    invariantVerification: { requiredAfter: readonly ['deployment_gate', 'next_normal_cron', 'mz_attempt_resolution']; piiFree: true };
}

function exactIdentity(identity: OpaqueRecoveryIdentity): void {
    if (!identity.subscriptionId || identity.subscriptionId !== identity.allowlistedSubscriptionId) {
        throw new Error('Recovery requires one exact allowlisted Subscription ID.');
    }
}

function assertDates(): void {
    for (const value of Object.values(CONFIRMED_RECOVERY_DATES).flatMap(Object.values)) assertEasternServiceDate(value);
}

function same<T>(actual: readonly T[], expected: readonly T[]): boolean {
    return JSON.stringify(actual) === JSON.stringify(expected);
}

function assertBeforeState(actual: ConfirmedRecoveryBeforeState, expected: ConfirmedRecoveryBeforeState): void {
    exactIdentity(actual.identity);
    const requiresFieldAttestation = expected.fieldCleaningEvidence !== null;
    const fieldEvidenceIsUsable = actual.fieldCleaningEvidence?.attested === true
        && actual.fieldCleaningEvidence.reference !== null
        && actual.fieldCleaningEvidence.contradictory === false;
    if (actual.identity.subscriptionId !== expected.identity.subscriptionId
        || actual.serviceCycleAnchor !== expected.serviceCycleAnchor
        || actual.serviceDay !== expected.serviceDay
        || JSON.stringify(actual.counts) !== JSON.stringify(expected.counts)
        || !same(actual.cycles, expected.cycles)
        || !same(actual.attempts, expected.attempts)
        || !same(actual.stops, expected.stops)
        || (requiresFieldAttestation && !fieldEvidenceIsUsable)) {
        throw new Error('Recovery before-state mismatch; no write may be attempted.');
    }
}

function expectedMz(identity: OpaqueRecoveryIdentity): ConfirmedRecoveryBeforeState {
    return {
        identity, serviceCycleAnchor: CONFIRMED_RECOVERY_DATES.mz.originalDueDate, serviceDay: 'WED',
        counts: { cycles: 2, attempts: 1, stops: 1, correctionEvents: 0 },
        cycles: [
            { dueDate: CONFIRMED_RECOVERY_DATES.mz.originalDueDate, state: 'exception' },
            { dueDate: CONFIRMED_RECOVERY_DATES.mz.nextNormalDueDate, state: 'open' },
        ],
        attempts: [{ serviceDate: CONFIRMED_RECOVERY_DATES.mz.originalDueDate, cycleDueDate: CONFIRMED_RECOVERY_DATES.mz.originalDueDate, state: 'Skipped', completedAt: null }],
        stops: [{ serviceDate: CONFIRMED_RECOVERY_DATES.mz.originalDueDate, cycleDueDate: CONFIRMED_RECOVERY_DATES.mz.originalDueDate, state: 'skipped' }],
        fieldCleaningEvidence: null,
    };
}

function expectedMb(identity: OpaqueRecoveryIdentity): ConfirmedRecoveryBeforeState {
    return {
        identity, serviceCycleAnchor: CONFIRMED_RECOVERY_DATES.mb.normalDueDate, serviceDay: 'MON',
        counts: { cycles: 1, attempts: 1, stops: 1, correctionEvents: 0 },
        cycles: [{ dueDate: CONFIRMED_RECOVERY_DATES.mb.normalDueDate, state: 'open' }],
        attempts: [{ serviceDate: CONFIRMED_RECOVERY_DATES.mb.normalDueDate, cycleDueDate: CONFIRMED_RECOVERY_DATES.mb.normalDueDate, state: 'Pending', completedAt: null }],
        stops: [{ serviceDate: CONFIRMED_RECOVERY_DATES.mb.normalDueDate, cycleDueDate: CONFIRMED_RECOVERY_DATES.mb.normalDueDate, state: 'assigned' }],
        fieldCleaningEvidence: null,
    };
}

function expectedAs(identity: OpaqueRecoveryIdentity): ConfirmedRecoveryBeforeState {
    return {
        identity, serviceCycleAnchor: null, serviceDay: 'MON',
        counts: { cycles: 0, attempts: 1, stops: 0, correctionEvents: 0 },
        cycles: [],
        attempts: [{ serviceDate: '2026-08-27T12:00:00.000Z', cycleDueDate: CONFIRMED_RECOVERY_DATES.as.fieldCleaningDate, state: 'Completed', completedAt: '2026-08-27T18:00:00.000Z' }],
        stops: [],
        fieldCleaningEvidence: { attested: true, reference: 'operator-supplied', contradictory: false },
    };
}

function after(state: ConfirmedRecoveryBeforeState): Omit<ConfirmedRecoveryBeforeState, 'identity' | 'fieldCleaningEvidence'> {
    return {
        serviceCycleAnchor: state.serviceCycleAnchor,
        serviceDay: state.serviceDay,
        counts: state.counts,
        cycles: state.cycles,
        attempts: state.attempts,
        stops: state.stops,
    };
}

export function buildConfirmedAffectedSubscriptionsRecoveryPlan(input: {
    mz: OpaqueRecoveryIdentity;
    mb: OpaqueRecoveryIdentity;
    as: OpaqueRecoveryIdentity;
}): ConfirmedRecoveryPlan {
    assertDates();
    exactIdentity(input.mz);
    exactIdentity(input.mb);
    exactIdentity(input.as);
    const mzBefore = expectedMz(input.mz);
    const mbBefore = expectedMb(input.mb);
    const asBefore = expectedAs(input.as);
    return {
        mode: 'dry_run', stripeMutation: 'prohibited',
        operations: [
            {
                case: 'mz_catch_up', kind: 'approve_catch_up', subscriptionId: input.mz.subscriptionId, expectedBefore: mzBefore,
                expectedAfter: after({ ...mzBefore, counts: { cycles: 2, attempts: 2, stops: 2, correctionEvents: 1 }, cycles: [{ dueDate: CONFIRMED_RECOVERY_DATES.mz.originalDueDate, state: 'open' }, { dueDate: CONFIRMED_RECOVERY_DATES.mz.nextNormalDueDate, state: 'open' }], attempts: [...mzBefore.attempts, { serviceDate: CONFIRMED_RECOVERY_DATES.mz.catchUpServiceDate, cycleDueDate: CONFIRMED_RECOVERY_DATES.mz.originalDueDate, state: 'Pending', completedAt: null }], stops: [...mzBefore.stops, { serviceDate: CONFIRMED_RECOVERY_DATES.mz.catchUpServiceDate, cycleDueDate: CONFIRMED_RECOVERY_DATES.mz.originalDueDate, state: 'assigned' }] }),
                appendOnlyEvidence: { eventType: 'transition', reason: 'data_integrity', correlationKey: `ticket-11:mz:${input.mz.subscriptionId}:2026-09-02` },
                inverseRepair: { kind: 'manual_audited_correction', retainAppendOnlyEvidence: true, steps: ['verify_catch_up_unfulfilled', 'remove_only_the_allowlisted_pending_attempt_and_stop', 'restore_exception_state', 'append_correction_event'] },
            },
            {
                case: 'mb_protected_route', kind: 'verify_protected_route', subscriptionId: input.mb.subscriptionId, expectedBefore: mbBefore, expectedAfter: after(mbBefore), appendOnlyEvidence: null,
                inverseRepair: { kind: 'manual_audited_correction', retainAppendOnlyEvidence: true, steps: ['no_mutation_planned', 'escalate_any_mismatch_to_ticket_02_recovery'] },
            },
            {
                case: 'as_anchor_finalization', kind: 'normalize_confirmed_cleaning_and_anchor', subscriptionId: input.as.subscriptionId, expectedBefore: asBefore,
                expectedAfter: after({ ...asBefore, serviceCycleAnchor: CONFIRMED_RECOVERY_DATES.as.firstNormalMondayAnchor, counts: { cycles: 0, attempts: 1, stops: 0, correctionEvents: 1 }, attempts: [{ serviceDate: CONFIRMED_RECOVERY_DATES.as.fieldCleaningDate, cycleDueDate: CONFIRMED_RECOVERY_DATES.as.fieldCleaningDate, state: 'Completed', completedAt: '2026-08-27T18:00:00.000Z' }] }),
                appendOnlyEvidence: { eventType: 'correction', reason: 'data_integrity', correlationKey: `ticket-11:as:${input.as.subscriptionId}:2026-09-28` },
                inverseRepair: { kind: 'manual_audited_correction', retainAppendOnlyEvidence: true, steps: ['do_not_delete_evidence', 'restore_verified_pre_anchor_value', 'restore_original_history_value_only_if_no_dependent_rows_changed', 'append_correction_event'] },
            },
        ],
        invariantVerification: { requiredAfter: ['deployment_gate', 'next_normal_cron', 'mz_attempt_resolution'], piiFree: true },
    };
}

/** Dependency-injected execution seam. Production callers must supply a separately authorized store. */
export interface ConfirmedRecoveryStore {
    readOnlyPreflight(subscriptionId: string): Promise<ConfirmedRecoveryBeforeState>;
    apply(operation: RecoveryOperation): Promise<void>;
    postWriteVerify(subscriptionId: string): Promise<ConfirmedRecoveryBeforeState>;
}

export async function preflightConfirmedAffectedSubscriptionsRecovery(
    plan: ConfirmedRecoveryPlan,
    store: Pick<ConfirmedRecoveryStore, 'readOnlyPreflight'>,
): Promise<void> {
    for (const operation of plan.operations) {
        const actual = await store.readOnlyPreflight(operation.subscriptionId);
        if (operation.case === 'as_anchor_finalization'
            && (actual.fieldCleaningEvidence?.attested !== true
                || actual.fieldCleaningEvidence.reference === null
                || actual.fieldCleaningEvidence.contradictory)) {
            throw new Error('A.S. remains needs_review because field-cleaning evidence is unavailable or contradictory; no anchor was guessed.');
        }
        assertBeforeState(actual, operation.expectedBefore);
    }
}

export async function executeConfirmedAffectedSubscriptionsRecovery(
    plan: ConfirmedRecoveryPlan,
    store: ConfirmedRecoveryStore,
    authorization: { approvedByOperator: true; dryRun?: false } | { approvedByOperator: false; dryRun: true } = { approvedByOperator: false, dryRun: true },
): Promise<'dry_run_verified' | 'applied'> {
    await preflightConfirmedAffectedSubscriptionsRecovery(plan, store);
    if (!authorization.approvedByOperator || authorization.dryRun !== false) return 'dry_run_verified';
    for (const operation of plan.operations) {
        if (operation.kind !== 'verify_protected_route') await store.apply(operation);
        const actual = await store.postWriteVerify(operation.subscriptionId);
        assertBeforeState(actual, { ...operation.expectedAfter, identity: operation.expectedBefore.identity, fieldCleaningEvidence: operation.expectedBefore.fieldCleaningEvidence });
    }
    return 'applied';
}

export interface RecoveryInvariantAuditInput { duplicateObligations: number; cyclesWithMultipleCompletions: number; noncanonicalDates: number; unexplainedParityDifferences: number; }
export function verifyConfirmedRecoveryInvariants(input: RecoveryInvariantAuditInput): { passed: boolean; counts: RecoveryInvariantAuditInput } {
    return { passed: Object.values(input).every((count) => count === 0), counts: input };
}
