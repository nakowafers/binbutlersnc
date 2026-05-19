'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { CreditCard, Pause, Play, Loader2, Settings } from "lucide-react";
import { createBillingPortalSession } from '@/app/portal/actions';

interface PortalActionsProps {
    isPaused: boolean;
}

export function PortalActions({ isPaused: initialPaused }: PortalActionsProps) {
    const [isPaused, setIsPaused] = useState(initialPaused);
    const [isBillingLoading, setIsBillingLoading] = useState(false);
    const [isPauseLoading, setIsPauseLoading] = useState(false);

    const handleBilling = async () => {
        setIsBillingLoading(true);
        try {
            // Call the Next.js Server Action
            await createBillingPortalSession();
        } catch (error) {
            console.error('Billing error:', error);
            alert('Something went wrong loading the billing portal.');
            setIsBillingLoading(false); // Only unset if it fails (redirect never returns)
        }
    };

    const togglePause = async () => {
        setIsPauseLoading(true);
        // In a real app, this would call an API route to update D1
        setTimeout(() => {
            setIsPaused(!isPaused);
            setIsPauseLoading(false);
            alert(isPaused ? 'Service resumed!' : 'Service paused for vacation.');
        }, 1000);
    };

    return (
        <div className="pt-4 space-y-3">
            <Button
                onClick={handleBilling}
                disabled={isBillingLoading}
                className="w-full bg-[#1C3D5A] hover:bg-[#152e44] text-white rounded-xl h-12 font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            >
                {isBillingLoading ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
                Manage Billing
            </Button>
            <Button
                onClick={togglePause}
                disabled={isPauseLoading}
                variant="outline"
                className="w-full border-slate-200 text-[#1C3D5A] rounded-xl h-12 font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            >
                {isPauseLoading ? <Loader2 size={18} className="animate-spin" /> : (isPaused ? <Play size={18} /> : <Pause size={18} />)}
                {isPaused ? 'Resume Service' : 'Vacation Mode'}
            </Button>
        </div>
    );
}

import { signOut } from 'next-auth/react';

export function SignOutButton() {
    return (
        <Button 
            variant="ghost" 
            className="text-slate-500 font-bold transition-all hover:bg-slate-100"
            onClick={() => signOut({ callbackUrl: '/signin' })}
        >
            Sign Out
        </Button>
    );
}

export function UpdateDetailsTrigger() {
    return (
        <Button variant="ghost" className="w-full text-[#7AC142] hover:text-[#68a638] font-bold p-0 justify-start transition-all active:scale-95">
            <Settings size={18} className="mr-2" /> Update Service Details
        </Button>
    );
}
