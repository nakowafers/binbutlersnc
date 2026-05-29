"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

export function Header() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
            <div className="container mx-auto px-4 h-20 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <Image src="/assets/logo.png" alt="Bin Butlers NC" width={1189} height={1251} className="h-12 w-auto" />
                </Link>
                
                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-8 text-[#1C3D5A] font-semibold">
                    <Link href="#how-it-works" className="hover:text-[#7AC142] transition-colors">How It Works</Link>
                    <Link href="#about" className="hover:text-[#7AC142] transition-colors">About</Link>
                    <Link href="#pricing" className="hover:text-[#7AC142] transition-colors">Pricing</Link>
                    <Link href="#faq" className="hover:text-[#7AC142] transition-colors">FAQ</Link>
                </nav>

                <div className="hidden md:flex items-center gap-4">
                    <Link href="/signin">
                        <Button variant="outline" className="border-[#1C3D5A] text-[#1C3D5A] rounded-xl font-bold transition-all active:scale-95">
                            Sign In
                        </Button>
                    </Link>
                    <Link href="/signup">
                        <Button className="bg-[#7AC142] hover:bg-[#68a638] text-white rounded-xl px-6 font-bold transition-all active:scale-95">
                            Book Now
                        </Button>
                    </Link>
                </div>

                {/* Mobile Menu Button */}
                <div className="flex md:hidden items-center gap-4">
                    <Link href="/signup">
                        <Button size="sm" className="bg-[#7AC142] hover:bg-[#68a638] text-white rounded-xl font-bold transition-all active:scale-95">
                            Book Now
                        </Button>
                    </Link>
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="text-[#1C3D5A] focus:outline-none p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                        aria-label="Toggle Menu"
                    >
                        {isOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </div>

            {/* Mobile Drawer */}
            {isOpen && (
                <div className="md:hidden border-t bg-white px-4 py-6 space-y-4 animate-in slide-in-from-top duration-200">
                    <nav className="flex flex-col gap-4 text-[#1C3D5A] font-semibold">
                        <Link 
                            href="#how-it-works" 
                            onClick={() => setIsOpen(false)}
                            className="hover:text-[#7AC142] py-2 border-b border-slate-100 transition-colors"
                        >
                            How It Works
                        </Link>
                        <Link 
                            href="#about" 
                            onClick={() => setIsOpen(false)}
                            className="hover:text-[#7AC142] py-2 border-b border-slate-100 transition-colors"
                        >
                            About
                        </Link>
                        <Link 
                            href="#pricing" 
                            onClick={() => setIsOpen(false)}
                            className="hover:text-[#7AC142] py-2 border-b border-slate-100 transition-colors"
                        >
                            Pricing
                        </Link>
                        <Link 
                            href="#faq" 
                            onClick={() => setIsOpen(false)}
                            className="hover:text-[#7AC142] py-2 border-b border-slate-100 transition-colors"
                        >
                            FAQ
                        </Link>
                        <Link 
                            href="/signin" 
                            onClick={() => setIsOpen(false)}
                            className="hover:text-[#7AC142] py-2 transition-colors"
                        >
                            Sign In
                        </Link>
                    </nav>
                </div>
            )}
        </header>
    );
}
