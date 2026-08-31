import { auth } from '@/auth';
import { createServiceDayReanchor } from '@/lib/backend/createServices';
import { ServiceDayReanchorPreview } from '@/lib/service-cycle/ServiceDayReanchor';
import { Env } from '@/lib/types';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { confirmServiceDayReanchor } from './actions';

export const runtime = 'edge';

const SERVICE_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function message(value: string | undefined) {
    return value || null;
}

export default async function ServiceDayReanchorPage({
    searchParams,
}: {
    searchParams?: Promise<{ subscriptionId?: string; serviceDay?: string; error?: string; result?: string; correlationKey?: string }>;
}) {
    const session = await auth();
    if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') redirect('/');

    const params = await searchParams;
    const subscriptionId = params?.subscriptionId?.trim();
    const selectedServiceDay = params?.serviceDay?.toUpperCase();
    const { env } = (getRequestContext() as unknown) as { env: Env };
    let preview: ServiceDayReanchorPreview | null = null;
    let previewError: string | null = null;

    if (subscriptionId) {
        try {
            preview = await createServiceDayReanchor(env).preview(subscriptionId, selectedServiceDay);
        } catch (error) {
            previewError = error instanceof Error ? error.message : 'The Stripe and D1 preview could not be loaded.';
        }
    }

    const operationNotice = message(params?.error);

    return (
        <div className="mx-auto w-full max-w-3xl space-y-6">
            <header className="space-y-2">
                <h1 className="text-3xl font-extrabold text-[#1C3D5A]">Service Day Repair</h1>
                <p className="text-slate-600">A narrow, audited repair for an active recurring subscription. It is not a recurring exceptions tool.</p>
            </header>

            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="flex gap-2 font-bold"><ShieldCheck size={18} /> Service schedule only</div>
                <p className="mt-1">This verifies Stripe&apos;s existing billing boundary. It does not change a Stripe Price, charge amount, cadence, invoice date, or <code>billing_cycle_anchor</code>. Stripe metadata and the D1 service schedule are changed together only after confirmation.</p>
            </section>

            <form className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
                <label className="flex-1 text-sm font-bold text-slate-700">Subscription ID
                    <input name="subscriptionId" required defaultValue={subscriptionId} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 font-normal" />
                </label>
                <label className="flex-1 text-sm font-bold text-slate-700">Proposed Service Day
                    <select name="serviceDay" defaultValue={selectedServiceDay || ''} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 font-normal">
                        <option value="">Select day</option>
                        {SERVICE_DAYS.map(day => <option key={day} value={day}>{day}</option>)}
                    </select>
                </label>
                <button className="min-h-11 rounded-md bg-[#1C3D5A] px-5 font-bold text-white">Preview</button>
            </form>

            {operationNotice ? <Notice kind="error" text={operationNotice} /> : null}
            {params?.result ? <Notice kind="success" text={params.result === 'already_applied' ? 'This repair was already recorded with the same correlation key.' : `Service schedule repair recorded (${params.correlationKey}).`} /> : null}
            {previewError ? <Notice kind="error" text={previewError} /> : null}

            {preview ? (
                <>
                    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-extrabold text-[#1C3D5A]">Read-before-write preview</h2>
                        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                            <Value label="Current Service Day" value={preview.current.serviceDay} />
                            <Value label="Current Service Cycle Anchor" value={preview.current.serviceCycleAnchor} />
                            <Value label="Cadence" value={`${preview.current.frequencyDays} days`} />
                            <Value label="Stripe billing boundary" value={preview.stripe.currentPeriodEnd} />
                            <Value label="Proposed Service Day" value={selectedServiceDay || 'Select a Service Day above'} />
                            <Value label="Proposed Service Cycle Anchor" value={preview.proposedAnchor} />
                        </dl>
                    </section>

                    {!preview.proposalAllowed ? (
                        <Notice kind="error" text={`The agreed Stripe billing boundary falls on ${preview.boundaryServiceDay}. Select ${preview.boundaryServiceDay} to make this audited service-schedule re-anchor; a different day would require a separately designed billing change.`} />
                    ) : (
                        <form action={confirmServiceDayReanchor} className="space-y-4 rounded-xl border border-[#7AC142] bg-white p-5 shadow-sm">
                            <h2 className="text-lg font-extrabold text-[#1C3D5A]">Confirm audited repair</h2>
                            <input type="hidden" name="subscription_id" value={subscriptionId} />
                            <input type="hidden" name="proposed_service_day" value={selectedServiceDay} />
                            <input type="hidden" name="expected_service_day" value={preview.current.serviceDay} />
                            <input type="hidden" name="expected_service_cycle_anchor" value={preview.current.serviceCycleAnchor} />
                            <input type="hidden" name="expected_current_period_end" value={preview.current.currentPeriodEnd} />
                            <input type="hidden" name="proposed_service_cycle_anchor" value={preview.proposedAnchor} />
                            <input type="hidden" name="stripe_period_boundary" value={preview.stripe.currentPeriodEnd} />
                            <input type="hidden" name="correlation_key" value={crypto.randomUUID()} />
                            <label className="block text-sm font-bold text-slate-700">Reason for this correction
                                <textarea required name="reason" rows={3} className="mt-1 w-full rounded-md border border-slate-300 p-3 font-normal" placeholder="Explain the verified service-day discrepancy." />
                            </label>
                            <label className="flex gap-2 text-sm text-slate-700"><input required name="confirmed" value="yes" type="checkbox" className="mt-1" /> I verified the current D1 and Stripe values above and approve this service-schedule-only repair.</label>
                            <button className="min-h-11 rounded-md bg-[#7AC142] px-5 font-bold text-white">Confirm Service Day Repair</button>
                        </form>
                    )}
                </>
            ) : null}
        </div>
    );
}

function Value({ label, value }: { label: string; value: string }) {
    return <div><dt className="font-bold text-slate-500">{label}</dt><dd className="mt-1 font-mono text-slate-900">{value}</dd></div>;
}

function Notice({ kind, text }: { kind: 'error' | 'success'; text: string }) {
    const Icon = kind === 'error' ? AlertTriangle : CheckCircle2;
    return <div className={`flex gap-2 rounded-lg border p-3 text-sm ${kind === 'error' ? 'border-red-300 bg-red-50 text-red-900' : 'border-green-300 bg-green-50 text-green-900'}`}><Icon size={18} className="shrink-0" />{text}</div>;
}
