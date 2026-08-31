'use server';

import { auth } from '@/auth';
import { createServiceDayReanchor } from '@/lib/backend/createServices';
import { Env } from '@/lib/types';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function redirectToPreview(params: Record<string, string>): never {
    redirect(`/admin/service-day-reanchor?${new URLSearchParams(params).toString()}`);
}

async function requireAdminOperator(): Promise<{ env: Env; operatorId: string }> {
    const session = await auth();
    const user = session?.user as { id?: string; email?: string | null; role?: string } | undefined;
    if (!user || user.role !== 'ADMIN') redirect('/');

    const operatorId = user.id || user.email;
    if (!operatorId) throw new Error('Authenticated administration Operator identity is required');

    const { env } = (getRequestContext() as unknown) as { env: Env };
    return { env, operatorId };
}

/** The confirmation endpoint intentionally accepts the preview's exact before-state. */
export async function confirmServiceDayReanchor(formData: FormData) {
    const subscriptionId = String(formData.get('subscription_id') || '').trim();
    const proposedServiceDay = String(formData.get('proposed_service_day') || '').trim().toUpperCase();
    const params = { subscriptionId, serviceDay: proposedServiceDay };
    if (formData.get('confirmed') !== 'yes') {
        redirectToPreview({ ...params, error: 'Confirmation is required before changing a service schedule.' });
    }

    const reason = String(formData.get('reason') || '').trim();
    const correlationKey = String(formData.get('correlation_key') || '').trim();
    const expectedServiceDay = String(formData.get('expected_service_day') || '').trim();
    const expectedServiceCycleAnchor = String(formData.get('expected_service_cycle_anchor') || '').trim();
    const expectedCurrentPeriodEnd = String(formData.get('expected_current_period_end') || '').trim();
    const proposedServiceCycleAnchor = String(formData.get('proposed_service_cycle_anchor') || '').trim();
    const stripePeriodBoundary = String(formData.get('stripe_period_boundary') || '').trim();

    if (!subscriptionId || !reason || !correlationKey || !expectedServiceDay || !expectedServiceCycleAnchor
        || !expectedCurrentPeriodEnd || !proposedServiceDay || !proposedServiceCycleAnchor || !stripePeriodBoundary) {
        redirectToPreview({ ...params, error: 'The preview is incomplete. Reload it before confirming.' });
    }

    const { env, operatorId } = await requireAdminOperator();
    let result: 'applied' | 'already_applied';
    try {
        result = await createServiceDayReanchor(env).execute({
            subscriptionId,
            expected: {
                serviceDay: expectedServiceDay,
                serviceCycleAnchor: expectedServiceCycleAnchor,
                currentPeriodEnd: expectedCurrentPeriodEnd,
            },
            proposal: {
                serviceDay: proposedServiceDay,
                serviceCycleAnchor: proposedServiceCycleAnchor,
                stripePeriodBoundary,
            },
            actor: { id: operatorId, capacity: 'administration' },
            reason,
            occurredAt: new Date().toISOString(),
            correlationKey,
        });
    } catch (error) {
        // The operation has already attempted and verified its inverse repair before throwing.
        const message = error instanceof Error ? error.message : 'The service schedule repair failed closed.';
        redirectToPreview({ ...params, error: message });
    }
    revalidatePath('/admin/service-day-reanchor');
    redirectToPreview({ ...params, result, correlationKey });
}
