import { actualServiceDate, assertEasternServiceDate, firstServiceDayOnOrAfter } from './dates';
import { ServiceCycleActor } from './types';

const SUPPORTED_CADENCES = new Set([28, 56, 84]);
const SERVICE_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export interface ServiceDayReanchorSnapshot {
    subscriptionId: string;
    stripeSubscriptionId: string;
    status: string;
    addressId: string;
    serviceDay: string;
    trashDay: string | null;
    serviceCycleAnchor: string;
    frequencyDays: number;
    currentPeriodEnd: string;
}

export interface StripeSubscriptionBoundary {
    subscriptionId: string;
    status: string;
    frequencyDays: number;
    currentPeriodEnd: string;
    metadata: Record<string, string>;
}

export interface ServiceDayReanchorProposal {
    serviceDay: string;
    serviceCycleAnchor: string;
    /** The exact, already-agreed Stripe current-period boundary. */
    stripePeriodBoundary: string;
}

export interface ServiceDayReanchorInput {
    subscriptionId: string;
    expected: Pick<ServiceDayReanchorSnapshot, 'serviceDay' | 'serviceCycleAnchor' | 'currentPeriodEnd'>;
    proposal: ServiceDayReanchorProposal;
    actor: ServiceCycleActor;
    reason: string;
    occurredAt: string;
    correlationKey: string;
}

export interface ServiceDayReanchorRepository {
    getSnapshot(subscriptionId: string): Promise<ServiceDayReanchorSnapshot | null>;
    hasServiceCycle(subscriptionId: string, cycleDueDate: string): Promise<boolean>;
    hasAppliedReanchor(correlationKey: string): Promise<boolean>;
    applyReanchor(input: {
        expected: ServiceDayReanchorSnapshot;
        proposal: ServiceDayReanchorProposal;
        actor: ServiceCycleActor;
        reason: string;
        occurredAt: string;
        correlationKey: string;
    }): Promise<boolean>;
}

export interface ServiceDayReanchorStripeGateway {
    getSubscription(subscriptionId: string): Promise<StripeSubscriptionBoundary>;
    updateServiceCycleMetadata(input: {
        subscriptionId: string;
        serviceDay: string;
        serviceCycleAnchor: string;
        correlationKey: string;
        /** Null deletes the metadata key while correlationKey still protects API idempotency. */
        metadataCorrelationKey?: string | null;
        metadata: Record<string, string>;
    }): Promise<void>;
}

export type ServiceDayReanchorResult = 'applied' | 'already_applied';
export interface ServiceDayReanchorPreview {
    current: ServiceDayReanchorSnapshot;
    stripe: StripeSubscriptionBoundary;
    proposedAnchor: string;
    boundaryServiceDay: string;
    proposalAllowed: boolean;
}

/**
 * A deliberately narrow administrative operation. It never creates, changes,
 * or deletes Service Cycles or Service Attempts; the repository only changes
 * the effective day and future anchor after Stripe verification succeeds.
 */
export class ServiceDayReanchor {
    constructor(
        private readonly repository: ServiceDayReanchorRepository,
        private readonly stripe: ServiceDayReanchorStripeGateway,
    ) {}

    async preview(subscriptionId: string, proposedServiceDay?: string): Promise<ServiceDayReanchorPreview> {
        if (!subscriptionId) throw new Error('Subscription is required');
        const current = await this.repository.getSnapshot(subscriptionId);
        if (!current) throw new Error('Active recurring Subscription was not found');
        this.assertSupportedCurrentState(current);
        const stripe = await this.stripe.getSubscription(current.stripeSubscriptionId);
        this.assertStripeMatchesLocal(current, stripe);
        const proposedAnchor = actualServiceDate(new Date(stripe.currentPeriodEnd));
        if (!await this.repository.hasServiceCycle(subscriptionId, proposedAnchor)) {
            throw new Error('The proposed Service Cycle is not materialized; complete recovery prerequisites before re-anchoring');
        }
        const boundaryServiceDay = SERVICE_DAYS[new Date(`${proposedAnchor}T12:00:00.000Z`).getUTCDay()];
        return {
            current,
            stripe,
            proposedAnchor,
            boundaryServiceDay,
            proposalAllowed: proposedServiceDay?.toUpperCase() === boundaryServiceDay,
        };
    }

    async execute(input: ServiceDayReanchorInput): Promise<ServiceDayReanchorResult> {
        this.assertInput(input);
        if (await this.repository.hasAppliedReanchor(input.correlationKey)) return 'already_applied';

        const current = await this.repository.getSnapshot(input.subscriptionId);
        if (!current) throw new Error('Active recurring Subscription was not found');
        this.assertCurrentState(current, input);
        this.assertProposal(current, input.proposal);
        if (!await this.repository.hasServiceCycle(input.subscriptionId, input.proposal.serviceCycleAnchor)) {
            throw new Error('The proposed Service Cycle is not materialized; complete recovery prerequisites before re-anchoring');
        }

        const stripeBefore = await this.stripe.getSubscription(current.stripeSubscriptionId);
        this.assertStripeMatchesLocal(current, stripeBefore);

        try {
            await this.stripe.updateServiceCycleMetadata({
                subscriptionId: current.stripeSubscriptionId,
                serviceDay: input.proposal.serviceDay.toUpperCase(),
                serviceCycleAnchor: input.proposal.serviceCycleAnchor,
                correlationKey: input.correlationKey,
                metadata: stripeBefore.metadata,
            });

            const stripeAfter = await this.stripe.getSubscription(current.stripeSubscriptionId);
            this.assertStripeUpdate(stripeBefore, stripeAfter, input);
        } catch (error) {
            await this.restoreStripeOrFail(stripeBefore, current, input, error);
            throw error;
        }

        let applied: boolean;
        try {
            applied = await this.repository.applyReanchor({
                expected: current,
                proposal: { ...input.proposal, serviceDay: input.proposal.serviceDay.toUpperCase() },
                actor: input.actor,
                reason: input.reason.trim(),
                occurredAt: input.occurredAt,
                correlationKey: input.correlationKey,
            });
        } catch (error) {
            if (await this.repository.hasAppliedReanchor(input.correlationKey)) return 'already_applied';
            await this.restoreStripeOrFail(stripeBefore, current, input, error);
            throw error;
        }

        if (!applied) {
            if (await this.repository.hasAppliedReanchor(input.correlationKey)) return 'already_applied';
            await this.restoreStripeOrFail(stripeBefore, current, input, new Error('D1 state changed before the re-anchor could be recorded'));
            throw new Error('D1 state changed before the re-anchor could be recorded');
        }
        return 'applied';
    }

    private async restoreStripeOrFail(before: StripeSubscriptionBoundary, current: ServiceDayReanchorSnapshot, input: ServiceDayReanchorInput, cause: unknown): Promise<void> {
        try {
            await this.stripe.updateServiceCycleMetadata({
                subscriptionId: current.stripeSubscriptionId,
                serviceDay: before.metadata.service_day || current.serviceDay,
                serviceCycleAnchor: before.metadata.service_cycle_anchor || current.serviceCycleAnchor,
                correlationKey: `${input.correlationKey}:inverse`,
                metadataCorrelationKey: before.metadata.service_day_reanchor_correlation_key ?? null,
                metadata: before.metadata,
            });
            const restored = await this.stripe.getSubscription(current.stripeSubscriptionId);
            if (restored.metadata.service_day !== before.metadata.service_day
                || restored.metadata.service_cycle_anchor !== before.metadata.service_cycle_anchor
                || restored.metadata.service_day_reanchor_correlation_key !== before.metadata.service_day_reanchor_correlation_key
                || restored.currentPeriodEnd !== before.currentPeriodEnd) {
                throw new Error('Stripe inverse repair could not be verified');
            }
        } catch (repairError) {
            throw new Error(`Service Day re-anchor stopped with unverified Stripe state after a partial failure: ${(repairError as Error).message}; original failure: ${(cause as Error).message}`);
        }
    }

    private assertInput(input: ServiceDayReanchorInput): void {
        if (!input.subscriptionId || !input.correlationKey || !input.reason.trim()) throw new Error('Subscription, correlation key, and reason are required');
        if (input.actor.capacity !== 'administration' || !input.actor.id) throw new Error('Service Day re-anchor requires an administration Operator');
        if (Number.isNaN(Date.parse(input.occurredAt))) throw new Error('A valid operation timestamp is required');
    }

    private assertCurrentState(current: ServiceDayReanchorSnapshot, input: ServiceDayReanchorInput): void {
        this.assertSupportedCurrentState(current);
        if (current.serviceDay !== input.expected.serviceDay
            || current.serviceCycleAnchor !== input.expected.serviceCycleAnchor
            || current.currentPeriodEnd !== input.expected.currentPeriodEnd) {
            throw new Error('Service Day re-anchor before-state is stale');
        }
    }

    private assertSupportedCurrentState(current: ServiceDayReanchorSnapshot): void {
        if (current.status !== 'active') throw new Error('Only active recurring Subscriptions can be re-anchored');
        if (!SUPPORTED_CADENCES.has(current.frequencyDays)) throw new Error('Service Day re-anchor requires a supported 28, 56, or 84 day cadence');
    }

    private assertProposal(current: ServiceDayReanchorSnapshot, proposal: ServiceDayReanchorProposal): void {
        assertEasternServiceDate(proposal.serviceCycleAnchor);
        const serviceDay = proposal.serviceDay.toUpperCase();
        if (!SERVICE_DAYS.includes(serviceDay as typeof SERVICE_DAYS[number])) throw new Error('A valid proposed Service Day is required');
        if (firstServiceDayOnOrAfter(proposal.serviceCycleAnchor, serviceDay) !== proposal.serviceCycleAnchor) throw new Error('Proposed Service Cycle Anchor must match the proposed Service Day');
        if (proposal.stripePeriodBoundary !== current.currentPeriodEnd) throw new Error('Proposed Stripe period boundary must equal the agreed current period end');
        if (actualServiceDate(new Date(proposal.stripePeriodBoundary)) !== proposal.serviceCycleAnchor) throw new Error('Proposed Service Cycle Anchor must match the agreed Stripe period boundary date');
    }

    private assertStripeMatchesLocal(current: ServiceDayReanchorSnapshot, stripe: StripeSubscriptionBoundary): void {
        if (stripe.subscriptionId !== current.stripeSubscriptionId
            || !['active', 'trialing'].includes(stripe.status)
            || stripe.frequencyDays !== current.frequencyDays
            || stripe.currentPeriodEnd !== current.currentPeriodEnd
            || stripe.metadata.service_day !== current.serviceDay
            || stripe.metadata.service_cycle_anchor !== current.serviceCycleAnchor) {
            throw new Error('Stripe subscription does not match the verified D1 before-state');
        }
    }

    private assertStripeUpdate(before: StripeSubscriptionBoundary, after: StripeSubscriptionBoundary, input: ServiceDayReanchorInput): void {
        if (after.status !== before.status || after.frequencyDays !== before.frequencyDays || after.currentPeriodEnd !== before.currentPeriodEnd
            || after.metadata.service_day !== input.proposal.serviceDay.toUpperCase()
            || after.metadata.service_cycle_anchor !== input.proposal.serviceCycleAnchor
            || after.metadata.service_day_reanchor_correlation_key !== input.correlationKey) {
            throw new Error('Stripe re-anchor metadata could not be verified');
        }
    }
}
