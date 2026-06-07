'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
    Users,
    Settings,
} from 'lucide-react';
import { SignOutButton } from './sign-out-button';

const navItems = [
    // { href: '/admin', label: 'Schedule', icon: Calendar },
    { href: '/admin/customers', label: 'Customers', icon: Users },
    // { href: '/admin', label: 'Routes', icon: Truck },
    // { href: '/admin', label: 'History', icon: History },
];

export function AdminSidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-64 bg-[#1C3D5A] text-white p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-10">
                <Image src="/assets/logo.png" alt="Logo" width={1189} height={1251} className="h-8 w-auto brightness-0 invert" />
                <span className="font-bold text-xl">Admin</span>
            </div>

            <nav className="flex-grow space-y-2">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                                isActive
                                    ? 'bg-[#7AC142] font-bold'
                                    : 'hover:bg-white/10'
                            }`}
                        >
                            <item.icon size={20} />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="pt-6 border-t border-white/10">
                <Link href="/admin" className="flex items-center gap-3 p-3 hover:bg-white/10 rounded-xl transition-all">
                    <Settings size={20} /> Settings
                </Link>
                <div className="mt-2 w-full flex items-center justify-start text-white/70 hover:text-white">
                    <SignOutButton />
                </div>
            </div>
        </aside>
    );
}
