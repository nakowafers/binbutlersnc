'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { CreditCard, Pause, Play, Loader2, Settings } from "lucide-react";
import { createBillingPortalSession } from '@/app/portal/actions';
import { useRouter } from 'next/navigation';
import { Address } from '@/lib/types';
import { signOut } from 'next-auth/react';
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface PortalActionsProps {
    isPaused: boolean;
    subscriptionId: string;
}

export function PortalActions({ isPaused: initialPaused, subscriptionId }: PortalActionsProps) {
    const [isPaused, setIsPaused] = useState(initialPaused);
    const [isBillingLoading, setIsBillingLoading] = useState(false);
    const [isPauseLoading, setIsPauseLoading] = useState(false);
    const router = useRouter();

    const handleBilling = async () => {
        setIsBillingLoading(true);
        try {
            // Call the Next.js Server Action
            await createBillingPortalSession();
        } catch (error) {
            console.error('Billing error:', error);
            toast.error('Something went wrong loading the billing portal.');
            setIsBillingLoading(false); // Only unset if it fails (redirect never returns)
        }
    };

    const togglePause = async () => {
        if (!subscriptionId) {
            toast.error('No active subscription found to modify.');
            return;
        }
        setIsPauseLoading(true);
        try {
            const response = await fetch('/api/portal/vacation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    subscriptionId,
                    isPaused: !isPaused,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error((data as { error?: string }).error || 'Failed to update vacation mode.');
            }

            const data = await response.json() as { isPaused: boolean };
            setIsPaused(data.isPaused);
            if (data.isPaused) {
                toast.success('Service paused for vacation.');
            } else {
                toast.success('Service resumed!');
            }
            router.refresh();
        } catch (error: unknown) {
            console.error('Error toggling vacation mode:', error);
            const errorMessage = error instanceof Error ? error.message : 'Something went wrong while toggling vacation mode.';
            toast.error(errorMessage);
        } finally {
            setIsPauseLoading(false);
        }
    };

    return (
        <div className="pt-4 space-y-3">
            <Button
                onClick={handleBilling}
                disabled={isBillingLoading}
                className="w-full bg-[#1C3D5A] hover:bg-[#152e44] text-white rounded-xl h-12 font-bold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
                {isBillingLoading ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                Manage Billing
            </Button>
            <Button
                onClick={togglePause}
                disabled={isPauseLoading}
                variant="outline"
                className="w-full border-slate-200 text-[#1C3D5A] rounded-xl h-12 font-bold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
            >
                {isPauseLoading ? <Loader2 size={18} className="animate-spin" /> : (isPaused ? <Play size={18} /> : <Pause size={18} />)}
                {isPaused ? 'Resume Service' : 'Vacation Mode'}
            </Button>
        </div>
    );
}

export function SignOutButton() {
    return (
        <Button 
            variant="ghost" 
            className="text-slate-500 font-bold transition-all hover:bg-slate-100 cursor-pointer"
            onClick={() => signOut({ callbackUrl: '/signin' })}
        >
            Sign Out
        </Button>
    );
}

export function UpdateDetailsTrigger({ address }: { address?: Address }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <Button 
                variant="ghost" 
                className="w-full text-[#7AC142] hover:text-[#68a638] font-bold p-0 justify-start transition-all active:scale-95 cursor-pointer"
                onClick={() => setIsOpen(true)}
            >
                <Settings size={18} className="mr-2" /> Update Service Details
            </Button>
            <ServiceDetailsModal isOpen={isOpen} onClose={() => setIsOpen(false)} address={address} />
        </>
    );
}

export function RescheduleButton({ address }: { address?: Address }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <>
            <Button 
                variant="outline" 
                className="rounded-xl border-slate-200 font-bold text-[#1C3D5A] transition-all active:scale-95 cursor-pointer"
                onClick={() => setIsOpen(true)}
            >
                Reschedule
            </Button>
            <ServiceDetailsModal isOpen={isOpen} onClose={() => setIsOpen(false)} address={address} />
        </>
    );
}

export function ServiceDetailsModal({ isOpen, onClose, address }: { isOpen: boolean; onClose: () => void; address?: Address }) {
    const router = useRouter();
    const [serviceDay, setServiceDay] = useState(address?.service_day || 'MON');
    const [trashDay, setTrashDay] = useState(address?.trash_day || 'MON');
    const [gateCode, setGateCode] = useState(address?.gate_code || '');
    const [hoaName, setHoaName] = useState(address?.hoa_name || '');
    const [accessNotes, setAccessNotes] = useState(address?.access_notes || '');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            const response = await fetch('/api/portal/reschedule', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    serviceDay,
                    trashDay,
                    gateCode: gateCode || null,
                    hoaName: hoaName || null,
                    accessNotes: accessNotes || null,
                }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error((data as { error?: string }).error || 'Failed to update service details.');
            }

            toast.success('Service details updated successfully!');
            router.refresh();
            onClose();
        } catch (err: unknown) {
            console.error('Error updating details:', err);
            const errorMessage = err instanceof Error ? err.message : 'Something went wrong.';
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6 bg-white sm:rounded-3xl">
                <DialogHeader className="text-left">
                    <DialogTitle className="text-2xl font-extrabold text-[#1C3D5A]">Update Service Details</DialogTitle>
                    <DialogDescription className="text-sm text-slate-500 mt-1">
                        Make changes to your schedule and property access details.
                    </DialogDescription>
                </DialogHeader>

                {error && (
                    <div className="bg-red-50 text-red-600 text-sm p-3.5 rounded-xl font-bold">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Service Day</label>
                            <select
                                value={serviceDay}
                                onChange={(e) => setServiceDay(e.target.value)}
                                className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-xl px-4 h-12 font-semibold text-[#1C3D5A] focus:border-[#7AC142] focus:outline-none cursor-pointer"
                            >
                                <option value="MON">Monday</option>
                                <option value="TUE">Tuesday</option>
                                <option value="WED">Wednesday</option>
                                <option value="THU">Thursday</option>
                                <option value="FRI">Friday</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Trash Day</label>
                            <select
                                value={trashDay}
                                onChange={(e) => setTrashDay(e.target.value as 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI')}
                                className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-xl px-4 h-12 font-semibold text-[#1C3D5A] focus:border-[#7AC142] focus:outline-none cursor-pointer"
                            >
                                <option value="MON">Monday</option>
                                <option value="TUE">Tuesday</option>
                                <option value="WED">Wednesday</option>
                                <option value="THU">Thursday</option>
                                <option value="FRI">Friday</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Gate Code</label>
                            <input
                                type="text"
                                value={gateCode}
                                onChange={(e) => setGateCode(e.target.value)}
                                placeholder="None"
                                className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-xl px-4 h-12 font-semibold text-[#1C3D5A] focus:border-[#7AC142] focus:outline-none placeholder:text-slate-400"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">HOA Name</label>
                            <input
                                type="text"
                                value={hoaName}
                                onChange={(e) => setHoaName(e.target.value)}
                                placeholder="None"
                                className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-xl px-4 h-12 font-semibold text-[#1C3D5A] focus:border-[#7AC142] focus:outline-none placeholder:text-slate-400"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Access Notes</label>
                        <textarea
                            value={accessNotes}
                            onChange={(e) => setAccessNotes(e.target.value)}
                            placeholder="e.g. Leave bins on the left side of the driveway"
                            rows={3}
                            className="w-full bg-[#F8FAFC] border-2 border-slate-100 rounded-xl p-4 font-semibold text-[#1C3D5A] focus:border-[#7AC142] focus:outline-none placeholder:text-slate-400"
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1 border-slate-200 text-slate-600 rounded-xl h-12 font-bold cursor-pointer"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 bg-[#7AC142] hover:bg-[#68a638] text-white rounded-xl h-12 font-bold flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {isLoading && <Loader2 size={18} className="animate-spin" />}
                            Save Changes
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
