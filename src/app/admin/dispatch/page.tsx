import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { cookies } from 'next/headers';
import { decode } from 'next-auth/jwt';
import { redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Map, Navigation, Phone, SkipForward } from 'lucide-react';
import { createDatabase } from '@/lib/backend/createServices';
import { DispatchStop, Env, SalesRep } from '@/lib/types';
import { markStopComplete, skipStop } from './actions';

export const runtime = 'edge';

function todayIso(): string {
    return new Date().toISOString().split('T')[0];
}

function mapHref(stop: DispatchStop, apple: boolean): string {
    if (stop.latitude !== null && stop.latitude !== undefined && stop.longitude !== null && stop.longitude !== undefined) {
        const coords = `${stop.latitude},${stop.longitude}`;
        return apple
            ? `maps://?daddr=${coords}&dirflg=d`
            : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords)}`;
    }
    return apple
        ? `maps://?daddr=${encodeURIComponent(stop.raw_address)}&dirflg=d`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.raw_address)}`;
}

function scentLabel(scent?: string | null): string {
    return scent ? scent.replace(/_/g, ' ') : '';
}

function driverLabel(driver: SalesRep): string {
    return driver.email ? `${driver.id} (${driver.email})` : driver.id;
}

async function getAuthenticatedEmail(sessionEmail: string | null | undefined, authSecret: string): Promise<string | null> {
    if (sessionEmail) return sessionEmail;

    const cookieStore = await cookies();
    for (const cookieName of ['__Secure-authjs.session-token', 'authjs.session-token']) {
        const token = cookieStore.get(cookieName)?.value;
        if (!token) continue;

        const decoded = await decode({ token, secret: authSecret, salt: cookieName });
        const email = decoded?.email;
        if (typeof email === 'string' && email.length > 0) {
            return email;
        }
    }

    return null;
}

function RouteControls({
    drivers,
    selectedDriverId,
    selectedDate,
}: {
    drivers: SalesRep[];
    selectedDriverId: string;
    selectedDate: string;
}) {
    return (
        <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[1fr_180px_auto]">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Driver
                <select
                    name="driver"
                    defaultValue={selectedDriverId}
                    className="h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950"
                >
                    {drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>{driverLabel(driver)}</option>
                    ))}
                </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Date
                <input
                    name="date"
                    type="date"
                    defaultValue={selectedDate}
                    className="h-11 min-w-0 rounded-md border border-slate-300 px-3 text-base text-slate-950"
                />
            </label>
            <button className="h-11 self-end rounded-md bg-[#1C3D5A] px-4 font-bold text-white">
                View
            </button>
        </form>
    );
}

function StopCard({ stop, index }: { stop: DispatchStop; index: number }) {
    const phoneHref = stop.customer_phone ? `tel:${stop.customer_phone}` : null;

    return (
        <article className="w-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-xl font-extrabold text-[#1C3D5A]">Stop #{index + 1}</h2>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-bold text-white">
                    {stop.bin_count} {stop.bin_count === 1 ? 'bin' : 'bins'}
                </span>
                {stop.customer_scent ? (
                    <span className="rounded-full bg-[#7AC142] px-3 py-1 text-sm font-bold capitalize text-white">
                        {scentLabel(stop.customer_scent)}
                    </span>
                ) : null}
            </div>

            <div className="mt-4 space-y-2">
                <p className="text-lg font-bold text-slate-950">{stop.customer_name || 'Customer'}</p>
                <p className="break-words text-base leading-snug text-slate-700">{stop.raw_address}</p>
                {phoneHref ? (
                    <a className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 font-semibold text-[#1C3D5A]" href={phoneHref}>
                        <Phone size={18} />
                        {stop.customer_phone}
                    </a>
                ) : null}
            </div>

            {stop.service_notes ? (
                <div className="mt-4 flex gap-2 rounded-md border border-yellow-300 bg-yellow-100 p-3 text-sm font-semibold text-yellow-950">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <p className="break-words">{stop.service_notes}</p>
                </div>
            ) : null}

            {(stop.latitude === null || stop.latitude === undefined || stop.longitude === null || stop.longitude === undefined) ? (
                <p className="mt-3 text-sm font-semibold text-amber-700">Coordinates missing. Navigation will use the address.</p>
            ) : null}

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#1C3D5A] px-3 font-bold text-white" href={mapHref(stop, true)}>
                    <Navigation size={18} />
                    Apple Maps
                </a>
                <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#1C3D5A] px-3 font-bold text-[#1C3D5A]" href={mapHref(stop, false)} target="_blank" rel="noreferrer">
                    <Map size={18} />
                    Google Maps
                </a>
            </div>

            <div className="mt-3 grid gap-2">
                <form action={markStopComplete}>
                    <input type="hidden" name="stop_id" value={stop.id} />
                    <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-green-600 px-3 font-extrabold text-white">
                        <CheckCircle2 size={20} />
                        Mark Complete
                    </button>
                </form>
                <form action={skipStop} className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="stop_id" value={stop.id} />
                    <input
                        name="skip_reason"
                        required
                        placeholder="Skip reason"
                        className="min-h-12 min-w-0 rounded-md border border-slate-300 px-3 text-base"
                    />
                    <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-slate-700 px-4 font-bold text-white">
                        <SkipForward size={18} />
                        Skip
                    </button>
                </form>
            </div>
        </article>
    );
}

export default async function DispatchPage({
    searchParams,
}: {
    searchParams?: Promise<{ driver?: string; date?: string }>;
}) {
    const session = await auth();
    const { env } = (getRequestContext() as unknown) as { env: Env };
    const email = await getAuthenticatedEmail(session?.user?.email, env.AUTH_SECRET);
    if (!email) {
        redirect('/');
    }

    const db = createDatabase(env);
    const currentDriver = await db.getAdminDriverByEmail(email);
    if (!currentDriver?.is_admin) {
        redirect('/');
    }

    const params = await searchParams;
    const drivers = await db.getActiveAdminDrivers();
    const setup = await db.getDispatchSetupStatus();
    const selectedDriverId = params?.driver || currentDriver?.id || setup.defaultDriverId || drivers[0]?.id || '';
    const selectedDate = params?.date || todayIso();
    const stops = selectedDriverId ? await db.getRouteStops(selectedDriverId, selectedDate) : [];

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            <header className="space-y-1">
                <h1 className="text-2xl font-extrabold text-[#1C3D5A] md:text-3xl">My Route</h1>
                <p className="text-sm text-slate-600">Assigned service stops for the selected Admin-Driver and date.</p>
            </header>

            {!setup.isConfigured ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                    Dispatch setup is incomplete: {setup.missing.join(', ')}.
                </div>
            ) : null}

            <RouteControls drivers={drivers} selectedDriverId={selectedDriverId} selectedDate={selectedDate} />

            <section className="grid gap-3">
                {stops.length > 0 ? (
                    stops.map((stop, index) => <StopCard key={stop.id} stop={stop} index={index} />)
                ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-600">
                        No active stops for this driver and date.
                    </div>
                )}
            </section>
        </div>
    );
}
