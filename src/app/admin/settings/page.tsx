import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { createDatabase } from '@/lib/backend/createServices';
import { Env } from '@/lib/types';
import { applyHolidayShift, saveDispatchSettings } from './actions';
import { DispatchSettingsForm } from './dispatch-settings-form';

export const runtime = 'edge';

export default async function AdminSettingsPage() {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
        redirect('/');
    }

    const { env } = (getRequestContext() as unknown) as { env: Env };
    const db = createDatabase(env);
    const [drivers, setup, holidayOffset] = await Promise.all([
        db.getActiveAdminDrivers(),
        db.getDispatchSetupStatus(),
        db.getGlobalSetting('holiday_offset_hours'),
    ]);

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6">
            <header>
                <h1 className="text-3xl font-extrabold text-[#1C3D5A]">Settings</h1>
                <p className="text-slate-500">Configure dispatch routing and schedule controls.</p>
            </header>

            {!setup.isConfigured ? (
                <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                    <AlertTriangle size={18} className="shrink-0" />
                    <p>Dispatch setup is incomplete: {setup.missing.join(', ')}.</p>
                </div>
            ) : null}

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-xl font-bold text-[#1C3D5A]">Dispatch</h2>
                <DispatchSettingsForm
                    drivers={drivers}
                    selectedDriverId={setup.defaultDriverId || ''}
                    depotAddress={setup.depotAddress || ''}
                    depotLat={setup.depotLat}
                    depotLng={setup.depotLng}
                    action={saveDispatchSettings}
                />
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-xl font-bold text-[#1C3D5A]">Holiday Shift</h2>
                <p className="mt-1 text-sm text-slate-600">Current offset: {holidayOffset || '0'} hours</p>
                <form action={applyHolidayShift} className="mt-4">
                    <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-red-600 px-4 font-bold text-white">
                        <AlertTriangle size={18} />
                        Holiday Shift (+24h)
                    </button>
                </form>
            </section>
        </div>
    );
}
