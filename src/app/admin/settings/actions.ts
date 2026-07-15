'use server';

import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createDatabase } from '@/lib/backend/createServices';
import { createAdminSettingsService } from '@/lib/admin/createAdminServices';
import { Env } from '@/lib/types';

async function requireAdminEnv(): Promise<Env> {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
        redirect('/');
    }
    const { env } = (getRequestContext() as unknown) as { env: Env };
    return env;
}

export async function saveDispatchSettings(formData: FormData) {
    const env = await requireAdminEnv();
    const service = createAdminSettingsService(env);
    const keys = ['default_driver_sales_rep_id', 'route_depot_address', 'route_depot_lat', 'route_depot_lng'];

    for (const key of keys) {
        const value = String(formData.get(key) || '').trim();
        await service.updateSetting(key, value);
    }

    revalidatePath('/admin/settings');
    revalidatePath('/admin/dispatch');
}

export async function applyHolidayShift() {
    const env = await requireAdminEnv();
    const db = createDatabase(env);
    await db.setGlobalSetting('holiday_offset_hours', '24');
    revalidatePath('/admin/settings');
}
