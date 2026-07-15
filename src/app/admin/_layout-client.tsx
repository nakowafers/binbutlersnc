'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { AdminSidebar } from './admin-sidebar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import Image from 'next/image';

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-dvh flex-col bg-[#F8FAFC] md:flex-row">
            {/* Mobile top bar */}
            <header className="md:hidden flex items-center justify-between h-14 px-4 bg-[#1C3D5A] text-white shrink-0">
                <button
                    onClick={() => setSidebarOpen(true)}
                    className="flex items-center gap-2 p-2 min-h-[44px] min-w-[44px] rounded-xl hover:bg-white/10 transition-colors"
                    aria-label="Open menu"
                >
                    <Menu size={24} />
                </button>
                <div className="flex items-center gap-2">
                    <Image src="/assets/logo.png" alt="Logo" width={1189} height={1251} className="h-6 w-auto brightness-0 invert" />
                    <span className="font-bold text-lg">Admin</span>
                </div>
                <div className="w-10" />
            </header>

            {/* Desktop sidebar */}
            <AdminSidebar className="hidden md:flex" />

            {/* Mobile sidebar sheet */}
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetContent side="left" className="bg-[#1C3D5A] text-white p-0 border-0 [&>button]:text-white/70 [&>button]:top-6 [&>button]:right-6">
                    <AdminSidebar className="w-full" onClose={() => setSidebarOpen(false)} />
                </SheetContent>
            </Sheet>

            {/* Main content */}
            <main className="min-w-0 flex-grow overflow-y-auto px-3 py-4 sm:px-4 md:p-8">
                {children}
            </main>
        </div>
    );
}
