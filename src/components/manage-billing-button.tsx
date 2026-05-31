'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { createBillingPortal } from '@/app/success/actions';

export function ManageBillingButton({ sessionId }: { sessionId: string }) {
    const [isLoading, setIsLoading] = useState(false);

    const handleClick = async () => {
        setIsLoading(true);
        try {
            await createBillingPortal(sessionId);
        } catch (error) {
            console.error('Billing portal error:', error);
            setIsLoading(false);
        }
    };

    return (
        <Button
            onClick={handleClick}
            disabled={isLoading}
            className="w-full bg-[#1C3D5A] hover:bg-[#152e44] text-white rounded-xl h-12 font-bold flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
        >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ExternalLink size={18} />}
            {isLoading ? 'Redirecting...' : 'Manage Subscription in Stripe'}
        </Button>
    );
}
