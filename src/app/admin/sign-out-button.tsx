'use client';

import { Button } from "@/components/ui/button";
import { signOut } from 'next-auth/react';

export function SignOutButton() {
    return (
        <Button
            variant="ghost"
            className="text-white/70 hover:text-white font-bold transition-all p-0 cursor-pointer"
            onClick={() => signOut({ callbackUrl: '/signin' })}
        >
            Sign Out
        </Button>
    );
}
