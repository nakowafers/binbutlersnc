'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function HolidayShiftButton() {
    const [isShifting, setIsShifting] = useState(false);

    const handleHolidayShift = async () => {
        setIsShifting(true);
        try {
            const response = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'holiday_offset_hours', value: '24' }),
            });
            if (response.ok) {
                toast.success('Holiday shift applied! Next dispatch will be offset by 24 hours.');
            } else {
                toast.error('Failed to apply holiday shift. You might not have Admin privileges.');
            }
        } catch (error) {
            console.error('Holiday shift error:', error);
        } finally {
            setIsShifting(false);
        }
    };

    return (
        <Button
            onClick={handleHolidayShift}
            disabled={isShifting}
            className="bg-[#EF4444] hover:bg-[#dc2626] text-white rounded-xl h-12 px-6 font-bold"
        >
            <AlertTriangle size={18} className="mr-2" />
            {isShifting ? 'Applying Shift...' : 'Holiday Shift (+24h)'}
        </Button>
    );
}
