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
  ArrowRight
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
    <>
      <header className="relative">
        {/* Tier 1: Dark Navy Utility Ribbon */}
        <div className="relative z-10 bg-[#1C3D5A] text-white text-xs py-2 px-4 border-b border-white/10">
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

        {/* Tier 2: Solid Green Nav Bar */}
        <div className="relative z-20 bg-[#7AC142] text-white shadow-lg">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex items-center justify-between h-14">
              {/* Left Nav (desktop) — starts at lg so it never fights the straddling logo for width */}
              <nav className="hidden lg:flex items-center gap-1 font-extrabold text-sm text-white" aria-label="Main navigation">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="px-2 lg:px-4 py-2 rounded-xl hover:bg-[#1C3D5A]/15 transition-colors focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* Mobile/tablet menu toggle (left slot below lg) */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
              </button>

              {/* Right CTA — icon-only below sm so it can't collide with the centered logo on narrow phones */}
              <Link href="/signup" aria-label="Schedule Clean">
                <Button className="bg-[#1C3D5A] text-white hover:bg-[#152e44] font-black rounded-xl w-11 sm:w-auto px-0 sm:px-6 h-11 text-xs uppercase tracking-wider shadow-lg hover:scale-105 transition-[transform,background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-white">
                  <span className="hidden sm:inline">Schedule Clean</span>
                  <ArrowRight className="w-4 h-4 sm:w-3.5 sm:h-3.5 sm:ml-1 text-[#7AC142]" aria-hidden="true" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Tier 3: Video Band */}
        <div className="relative z-0 h-[280px] sm:h-[360px] md:h-[450px] overflow-hidden bg-[#7AC142]">
          <video
            className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="/assets/header-bg-poster.jpg"
            aria-hidden="true"
          >
            <source src="/assets/header-bg.webm" type="video/webm" />
            <source src="/assets/header-bg.mp4" type="video/mp4" />
          </video>
          {/* Gradient tint: strong near the nav bar, light through the middle, darker at the base */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#7AC142]/70 via-[#7AC142]/20 to-[#1C3D5A]/30" />
        </div>

        {/* Logo: straddles the navy ribbon, nav bar, and video band. No backing shape. */}
        <div className="pointer-events-none absolute inset-x-0 top-1 sm:top-2 z-40 flex justify-center">
          <Link
            href="/"
            className="pointer-events-auto group block rounded-2xl focus-visible:ring-4 focus-visible:ring-white focus-visible:outline-none"
            aria-label="Bin Butlers NC Home"
          >
            <Image
              src="/assets/logo.png"
              alt="Bin Butlers NC Royal Crest"
              width={1197}
              height={1260}
              className="h-48 sm:h-28 md:h-40 lg:h-56 xl:h-64 w-auto object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.45)] transition-transform group-hover:scale-105 duration-200"
              priority
            />
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
    </>
  );
}
