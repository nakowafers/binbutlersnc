'use server';

import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createDatabase } from '@/lib/backend/createServices';
import { Env } from '@/lib/types';

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
    if (!stopId || !reason) return;

    const { db, driverId } = await requireAdminDriver();
    await db.skipDispatchStop(stopId, driverId, reason, new Date().toISOString());
    revalidatePath('/admin/dispatch');
}
