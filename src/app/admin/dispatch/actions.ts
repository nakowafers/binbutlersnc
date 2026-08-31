'use server';

import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createDatabase } from '@/lib/backend/createServices';
import { Env } from '@/lib/types';
import { ServiceCycleExceptionReason } from '@/lib/service-cycle/types';

async function requireAdminDriver() {
    const session = await auth();
    const role = (session?.user as { role?: string } | undefined)?.role;
    const email = session?.user?.email;
    if (!session?.user || role !== 'ADMIN' || !email) {
        redirect('/');
    }

    const { env } = (getRequestContext() as unknown) as { env: Env };
    const db = createDatabase(env);
    const driver = await db.getAdminDriverByEmail(email);
    return {
        db,
        driverId: driver?.id || (session.user as { id?: string }).id || email,
    };
}

export async function markStopComplete(formData: FormData) {
    const stopId = String(formData.get('stop_id') || '');
    if (!stopId) return;

    const { db, driverId } = await requireAdminDriver();
    await db.markDispatchStopCompleted(stopId, driverId, new Date().toISOString());
    revalidatePath('/admin/dispatch');
}

export async function skipStop(formData: FormData) {
    const stopId = String(formData.get('stop_id') || '');
    const reason = String(formData.get('skip_reason') || '').trim();
    const notes = String(formData.get('notes') || '').trim();
    if (!stopId || !reason) return;

    const { db, driverId } = await requireAdminDriver();
    await db.skipDispatchStop(stopId, driverId, reason, new Date().toISOString(), notes || undefined);
    revalidatePath('/admin/dispatch');
}

export async function approveCatchUpService(formData: FormData) {
    const cycleId = String(formData.get('cycle_id') || '').trim();
    const serviceDate = String(formData.get('service_date') || '').trim();
    if (!cycleId || !serviceDate) return;

    const { db, driverId } = await requireAdminDriver();
    await db.approveCatchUpService({
        cycleId,
        serviceDate,
        actor: { id: driverId, capacity: 'administration' },
        occurredAt: new Date().toISOString(),
    });
    revalidatePath('/admin/dispatch');
}

export async function waiveServiceCycle(formData: FormData) {
    const cycleId = String(formData.get('cycle_id') || '').trim();
    const reason = String(formData.get('reason') || '').trim();
    const notes = String(formData.get('notes') || '').trim();
    if (!cycleId || !reason || !notes) return;

    const { db, driverId } = await requireAdminDriver();
    await db.waiveServiceCycle({
        cycleId,
        reason: reason as ServiceCycleExceptionReason,
        notes,
        actor: { id: driverId, capacity: 'administration' },
        occurredAt: new Date().toISOString(),
    });
    revalidatePath('/admin/dispatch');
}
