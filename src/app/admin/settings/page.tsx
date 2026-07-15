import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { redirect } from 'next/navigation';
import { AlertTriangle, Save } from 'lucide-react';
import { createDatabase } from '@/lib/backend/createServices';
import { Env } from '@/lib/types';
import { applyHolidayShift, saveDispatchSettings } from './actions';

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
                <form action={saveDispatchSettings} className="mt-4 grid gap-4">
                    <label className="grid gap-1 text-sm font-semibold text-slate-700">
                        Default Admin-Driver
                        <select
                            name="default_driver_sales_rep_id"
                            defaultValue={setup.defaultDriverId || ''}
                            className="h-11 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950"
                        >
                            <option value="">Select driver</option>
                            {drivers.map((driver) => (
                                <option key={driver.id} value={driver.id}>
                                    {driver.email ? `${driver.id} (${driver.email})` : driver.id}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="grid gap-1 text-sm font-semibold text-slate-700">
                        Depot Address
                        <input
                            name="route_depot_address"
                            defaultValue={setup.depotAddress || ''}
                            className="h-11 rounded-md border border-slate-300 px-3 text-base"
                        />
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm font-semibold text-slate-700">
                            Depot Latitude
                            <input
                                name="route_depot_lat"
                                defaultValue={setup.depotLat ?? ''}
                                className="h-11 rounded-md border border-slate-300 px-3 text-base"
                            />
                        </label>
                        <label className="grid gap-1 text-sm font-semibold text-slate-700">
                            Depot Longitude
                            <input
                                name="route_depot_lng"
                                defaultValue={setup.depotLng ?? ''}
                                className="h-11 rounded-md border border-slate-300 px-3 text-base"
                            />
                        </label>
                    </div>

                    <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#1C3D5A] px-4 font-bold text-white">
                        <Save size={18} />
                        Save Dispatch Settings
                    </button>
                </form>
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
