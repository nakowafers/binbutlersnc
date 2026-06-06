import { auth } from '@/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { redirect } from 'next/navigation';
import { Env } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, Clock } from "lucide-react";
import { HolidayShiftButton } from './holiday-shift-button';

export const runtime = 'edge';

export default async function AdminDashboard() {
    const session = await auth();
    
    if (!session || !session.user || (session.user as { role?: string }).role !== 'ADMIN') {
        redirect('/');
    }

    const { env } = (getRequestContext() as unknown) as { env: Env };

    const db = new D1DatabaseAdapter(env.DB);

    // 1. Fetch Active Subscriptions
    const activeSubs = await db.getActiveSubscriptionsCount();

    // 2. Fetch Completed Stops (This Week)
    const completedStops = await db.getCompletedStopsCountLast7Days();

    // 3. Calculate Estimated Weekly Revenue (Simplification)
    const total_revenue = await db.calculateEstimatedWeeklyRevenue();

    // 4. Recent Activity
    const recentActivity = await db.getRecentActivity(5);

    // Calculate next Sunday for dispatch
    const nextSunday = new Date();
    nextSunday.setDate(nextSunday.getDate() + ((7 - nextSunday.getDay()) % 7));
    nextSunday.setHours(0, 0, 0, 0);

    return (
        <>
            <header className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-extrabold text-[#1C3D5A]">Operations Overview</h1>
                    <p className="text-slate-500">Manage your dispatch and customer subscriptions.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="font-bold text-[#1C3D5A]">Next Dispatch</p>
                        <p className="text-sm text-[#7AC142]">{nextSunday.toLocaleDateString()} @ 00:00</p>
                    </div>
                    <HolidayShiftButton />
                </div>
            </header>

            {/* Stats Grid */}
            <div className="grid md:grid-cols-4 gap-6 mb-10">
                <Card className="border-none shadow-sm rounded-2xl">
                    <CardContent className="p-6">
                        <p className="text-sm text-slate-500 mb-1">Active Subscriptions</p>
                        <h3 className="text-2xl font-extrabold text-[#1C3D5A]">{activeSubs}</h3>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm rounded-2xl">
                    <CardContent className="p-6">
                        <p className="text-sm text-slate-500 mb-1">Pending Stops (Est.)</p>
                        <h3 className="text-2xl font-extrabold text-[#1C3D5A]">{Math.ceil(activeSubs / 4)}</h3>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm rounded-2xl">
                    <CardContent className="p-6">
                        <p className="text-sm text-slate-500 mb-1">Completed (Week)</p>
                        <h3 className="text-2xl font-extrabold text-[#1C3D5A]">{completedStops}</h3>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm rounded-2xl">
                    <CardContent className="p-6">
                        <p className="text-sm text-slate-500 mb-1">Est. Weekly Revenue</p>
                        <h3 className="text-2xl font-extrabold text-[#7AC142]">${(total_revenue || 0).toFixed(2)}</h3>
                    </CardContent>
                </Card>
            </div>

            {/* Main Dashboard Area */}
            <div className="grid lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2 border-none shadow-md rounded-[2rem] overflow-hidden">
                    <CardHeader className="bg-white border-b p-8">
                        <CardTitle className="text-xl font-bold text-[#1C3D5A]">Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y">
                            {recentActivity.length > 0 ? recentActivity.map((item, i) => (
                                <div key={i} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                            item.status === 'Completed' ? 'bg-lime-100 text-[#7AC142]' : 'bg-blue-100 text-blue-600'
                                        }`}>
                                            {item.status === 'Completed' ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-[#1C3D5A]">{item.customer}</p>
                                            <p className="text-sm text-slate-500">{item.address}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-[#1C3D5A]">{item.status}</p>
                                        <p className="text-xs text-slate-400">{new Date(item.time).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            )) : (
                                <div className="p-12 text-center text-slate-400">
                                    No recent service activity.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md rounded-[2rem] overflow-hidden bg-[#1C3D5A] text-white">
                    <CardHeader className="p-8">
                        <CardTitle className="text-xl font-bold">Route Efficiency</CardTitle>
                        <CardDescription className="text-slate-400">Routific optimization metrics.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-8 space-y-8">
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-sm font-bold">Fuel Saved</span>
                                <span className="text-sm text-[#7AC142]">0%</span>
                            </div>
                            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                                <div className="bg-[#7AC142] h-full w-[0%]" />
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between mb-2">
                                <span className="text-sm font-bold">Stops per Hour</span>
                                <span className="text-sm text-[#7AC142]">0.0</span>
                            </div>
                            <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                                <div className="bg-[#7AC142] h-full w-[0%]" />
                            </div>
                        </div>
                        <div className="pt-4">
                            <Button className="w-full bg-white/10 hover:bg-white/20 text-white rounded-xl h-12">
                                Full Optimization Report
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

