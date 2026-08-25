"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { 
  Menu, 
  X, 
  Phone, 
  MapPin, 
  ArrowRight,
  Award
} from "lucide-react";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#about", label: "About" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <div className="relative">
      {/* Tier 1: Dark Navy Utility Ribbon */}
      <div className="bg-[#1C3D5A] text-white text-xs py-2 px-4 border-b border-white/10 relative z-30">
        <div className="container mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-semibold text-slate-200">
              <MapPin className="w-3.5 h-3.5 text-[#7AC142]" aria-hidden="true" />
              <span className="hidden sm:inline">Serving Charlotte, Huntersville, Matthews & Surrounding Areas</span>
              <span className="sm:hidden">Serving Greater Charlotte Area</span>
            </span>
          </div>
          <div className="flex items-center gap-4 font-bold">
            <a href="tel:9802408078" className="hover:text-[#7AC142] flex items-center gap-1 transition-colors focus-visible:ring-2 focus-visible:ring-[#7AC142] rounded-md min-h-[44px] items-center inline-flex">
              <Phone className="w-3.5 h-3.5 text-[#7AC142]" aria-hidden="true" /> (980) 240-8078
            </a>
          </div>
        </div>
      </div>

      {/* Tier 2: Pure #7AC142 Green Main Header Bar */}
      <header className="relative bg-[#7AC142] text-white pt-3 sm:pt-4 pb-24 sm:pb-36 md:pb-56 shadow-2xl z-20">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center justify-between h-14">
            {/* Left Nav */}
            <nav className="hidden md:flex items-center gap-1 font-extrabold text-sm text-white" aria-label="Main navigation">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-4 py-2 rounded-xl hover:bg-[#1C3D5A]/15 transition-colors focus-visible:ring-2 focus-visible:ring-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <span className="md:hidden font-black text-white text-sm uppercase tracking-wider">
              Bin Butlers NC
            </span>

            {/* Right Top Buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/signup">
                <Button className="bg-[#1C3D5A] text-white hover:bg-[#152e44] font-black rounded-xl px-3 sm:px-6 h-11 text-xs uppercase tracking-wider shadow-lg hover:scale-105 transition-[transform,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-white">
                  Schedule Clean <ArrowRight className="w-3.5 h-3.5 ml-1 text-[#7AC142]" aria-hidden="true" />
                </Button>
              </Link>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>

        {/* Titan Logo Medallion in High-Contrast Navy Outer Bevel Ring & Gold Ribbon */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-[38%] z-30 pointer-events-auto">
          <Link href="/" className="group block rounded-full focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none" aria-label="Bin Butlers NC Home">
            <div className="relative bg-white p-3.5 sm:p-6 md:p-14 rounded-full shadow-[0_35px_80px_-15px_rgba(28,61,90,0.4)] border-4 border-white ring-4 sm:ring-8 md:ring-10 ring-[#1C3D5A] flex flex-col items-center justify-center transition-transform group-hover:scale-105 duration-200">
              <Image
                src="/assets/logo.png"
                alt="Bin Butlers NC Royal Crest"
                width={1189}
                height={1251}
                className="h-20 sm:h-36 md:h-96 w-auto object-contain drop-shadow-xl"
                priority
              />

              {/* Gold/Navy Base Ribbon */}
              <div className="absolute -bottom-3 sm:-bottom-4 bg-[#1C3D5A] text-white px-3 sm:px-5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[11px] md:text-xs font-black uppercase tracking-wider md:tracking-widest shadow-xl border-2 border-amber-400 flex items-center gap-1.5 whitespace-nowrap">
                <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                <span>Greater Charlotte • 5-Star Rated</span>
              </div>
            </div>
          </Link>
        </div>
      </header>

      {/* Mobile Navigation Drawer (Elevated Full-Screen Overlay) */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-50 bg-[#1C3D5A]/95 backdrop-blur-md flex flex-col justify-between p-6 text-white md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          {/* Top Bar inside Drawer */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <span className="font-black text-white text-base uppercase tracking-wider">
              Bin Butlers NC
            </span>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-lg text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close menu"
            >
              <X size={24} aria-hidden="true" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col items-center justify-center space-y-4 py-8" aria-label="Mobile main navigation">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center py-3 text-lg font-extrabold hover:text-[#7AC142] transition-colors rounded-xl min-h-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#7AC142]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Bottom Actions */}
          <div className="flex flex-col items-center gap-4 pt-4 border-t border-white/10">
            <a
              href="tel:9802408078"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 text-sm font-bold text-slate-200 hover:text-[#7AC142] min-h-[44px] w-full transition-colors focus-visible:ring-2 focus-visible:ring-[#7AC142] rounded-md"
            >
              <Phone className="w-4 h-4 text-[#7AC142]" aria-hidden="true" /> (980) 240-8078
            </a>
            <Link href="/signup" onClick={() => setMobileMenuOpen(false)} className="w-full">
              <Button className="w-full bg-[#7AC142] text-[#1C3D5A] hover:bg-[#68a635] font-black rounded-xl h-12 text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-white">
                Schedule Clean <ArrowRight className="w-4 h-4 text-[#1C3D5A]" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

