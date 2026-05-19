import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Env, Customer, Subscription, Address, ServiceHistory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Calendar,
    History,
    CheckCircle2,
    Clock,
    Camera,
    MapPin
} from "lucide-react";
import Link from 'next/link';
import { PortalActions, UpdateDetailsTrigger, SignOutButton } from "@/components/portal-actions";

export const runtime = 'edge';

export default async function PortalPage() {
    const session = await auth();
    if (!session || !session.user) {
        redirect("/signin");
    }

    const { env } = (getRequestContext() as unknown) as { env: Env };

    // 1. Fetch data from D1
    const customer = await env.DB.prepare('SELECT * FROM customers WHERE email = ?')
        .bind(session.user.email)
        .first<Customer>();

    if (!customer) {
        return <div>Profile not found. Please contact support.</div>;
    }

    const subscription = await env.DB.prepare('SELECT * FROM subscriptions WHERE customer_id = ?')
        .bind(customer.id)
        .first<Subscription>();

    const address = await env.DB.prepare('SELECT * FROM addresses WHERE id = ?')
        .bind(customer.address_id)
        .first<Address>();

    const { results: history } = await env.DB.prepare(
        'SELECT * FROM service_history WHERE customer_id = ? ORDER BY service_date DESC LIMIT 5'
    )
    .bind(customer.id)
    .all<ServiceHistory>();

    return (
        <div className="min-h-screen bg-[#F8FAFC]">
            {/* Nav */}
            <header className="bg-white border-b h-20 flex items-center">
                <div className="container mx-auto px-4 flex justify-between items-center">
                    <Link href="/">
                        <img src="/assets/logo.png" alt="Logo" className="h-10 w-auto" />
                    </Link>
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-[#1C3D5A] hidden sm:block">{session.user.email}</span>
                        <SignOutButton />
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-4 py-12">
                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Left Column: Status & Progress */}
                    <div className="lg:col-span-2 space-y-8">
                        <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden">
                            <CardHeader className="bg-[#1C3D5A] text-white p-8 flex flex-row justify-between items-center">
                                <div>
                                    <CardTitle className="text-2xl font-extrabold">Next Cleaning</CardTitle>
                                    <CardDescription className="text-slate-300">Your bins are scheduled for professional care.</CardDescription>
                                </div>
                                <div className="bg-[#7AC142] text-white px-4 py-2 rounded-full font-bold text-sm">
                                    {subscription?.is_paused ? 'Paused' : 'Active'}
                                </div>
                            </CardHeader>
                            <CardContent className="p-8">
                                {/* Progress Steps as per DESIGN.md */}
                                <div className="flex items-center justify-between relative mb-10 px-4">
                                    <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -translate-y-1/2 z-0" />
                                    {[
                                        { label: 'Scheduled', icon: Calendar, active: true },
                                        { label: 'Dispatched', icon: Clock, active: false },
                                        { label: 'Completed', icon: CheckCircle2, active: false }
                                    ].map((step, i) => (
                                        <div key={i} className="relative z-10 flex flex-col items-center gap-3">
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                                                step.active ? 'bg-[#7AC142] text-white shadow-lg shadow-lime-500/20' : 'bg-white border-2 border-slate-100 text-slate-300'
                                            }`}>
                                                <step.icon size={24} />
                                            </div>
                                            <span className={`text-xs font-bold ${step.active ? 'text-[#1C3D5A]' : 'text-slate-400'}`}>
                                                {step.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="p-6 bg-[#F8FAFC] rounded-3xl flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-[#7AC142]">
                                            <Calendar />
                                        </div>
                                        <div>
                                            <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">Estimated Date</p>
                                            <p className="text-xl font-extrabold text-[#1C3D5A]">
                                                {address?.service_day ? `${address.service_day}, May 18` : 'Pending'}
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="outline" className="rounded-xl border-slate-200">
                                        Reschedule
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Service History - Polaroid Style as per DESIGN.md */}
                        <div>
                            <h3 className="text-2xl font-extrabold text-[#1C3D5A] mb-6 flex items-center gap-3">
                                <History className="text-[#7AC142]" /> Service History
                            </h3>
                            <div className="grid md:grid-cols-2 gap-6">
                                {history && history.length > 0 ? history.map((item, i) => (
                                    <Card key={i} className="border-none shadow-md rounded-[2rem] overflow-hidden group hover:shadow-xl transition-all">
                                        <div className="aspect-[4/3] bg-slate-200 relative overflow-hidden">
                                            {item.photo_url ? (
                                                <img src={item.photo_url} alt="Service Proof" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                                                    <Camera size={48} />
                                                    <span className="font-bold">No Photo Available</span>
                                                </div>
                                            )}
                                            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full text-[10px] font-bold text-[#1C3D5A] uppercase tracking-widest">
                                                {item.dispatch_status}
                                            </div>
                                        </div>
                                        <CardContent className="p-6">
                                            <p className="text-sm font-bold text-[#1C3D5A]">{new Date(item.service_date).toLocaleDateString()}</p>
                                            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                                                <MapPin size={12} /> {address?.raw_address}
                                            </p>
                                        </CardContent>
                                    </Card>
                                )) : (
                                    <p className="text-slate-400 col-span-2 py-12 text-center border-2 border-dashed rounded-[2rem]">
                                        Your first cleaning is just a butler away!
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Account Management */}
                    <div className="space-y-8">
                        <Card className="border-none shadow-lg rounded-[2.5rem] overflow-hidden">
                            <CardHeader className="border-b bg-white p-8">
                                <CardTitle className="text-xl font-extrabold text-[#1C3D5A]">Subscription</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-6">
                                <div>
                                    <p className="text-sm text-slate-500 font-bold mb-1 uppercase tracking-wider">Plan</p>
                                    <p className="text-lg font-extrabold text-[#1C3D5A]">
                                        {subscription?.frequency_days === 84 ? 'Quarterly Refresh' : 'Monthly Subscription'}
                                    </p>
                                    <div className="text-sm text-slate-400">Renews on {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'N/A'}</div>
                                    </div>

                                    <PortalActions isPaused={subscription?.is_paused || false} />
                                    </CardContent>
                        </Card>

                        <Card className="border-none shadow-lg rounded-[2.5rem] overflow-hidden">
                            <CardHeader className="border-b bg-white p-8">
                                <CardTitle className="text-xl font-extrabold text-[#1C3D5A]">Service Details</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-6">
                                <div>
                                    <p className="text-sm text-slate-500 font-bold mb-1 uppercase tracking-wider">Address</p>
                                    <p className="text-sm font-semibold text-[#1C3D5A] leading-relaxed">{address?.raw_address}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-slate-500 font-bold mb-1 uppercase tracking-wider">Trash Day</p>
                                        <p className="text-sm font-semibold text-[#1C3D5A]">{address?.trash_day || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-500 font-bold mb-1 uppercase tracking-wider">Bins</p>
                                        <p className="text-sm font-semibold text-[#1C3D5A]">{customer?.bin_quantity || 1}</p>
                                    </div>
                                </div>
                                <UpdateDetailsTrigger />
                            </CardContent>
                        </Card>

                        <div className="p-8 bg-lime-50 rounded-[2.5rem] border border-lime-100">
                            <h4 className="font-extrabold text-[#1C3D5A] mb-2 flex items-center gap-2">
                                <CheckCircle2 size={18} className="text-[#7AC142]" /> Need Help?
                            </h4>
                            <p className="text-sm text-slate-600 mb-4">Our butlers are here to assist with any questions.</p>
                            <a href="mailto:support@binbutlersnc.com" className="text-sm font-bold text-[#7AC142] underline">Contact Support</a>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
