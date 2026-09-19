"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
  label,
  sizes,
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
  label: string;
  sizes?: string;
}) {
  const [position, setPosition] = useState(55);

  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-3xl shadow-xl select-none focus-within:ring-2 focus-within:ring-[#7AC142] focus-within:ring-offset-2">
      {/* Clean photo: always fully painted underneath */}
      <Image
        src={afterSrc}
        alt={afterAlt}
        fill
        sizes={sizes}
        className="object-cover pointer-events-none"
      />

      {/* Dirty photo: clipped to reveal the clean photo as the handle moves right */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <Image
          src={beforeSrc}
          alt={beforeAlt}
          fill
          sizes={sizes}
          className="object-cover pointer-events-none"
        />
      </div>

      {/* Visual handle: a vertical rule + circular knob, purely decorative */}
      <div
        className="absolute inset-y-0 pointer-events-none"
        style={{ left: `${position}%` }}
      >
        <div className="absolute inset-y-0 -translate-x-1/2 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" />
        <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white border-2 border-[#1C3D5A] shadow-lg flex items-center justify-center gap-0.5">
          <ChevronLeft className="w-3.5 h-3.5 text-[#1C3D5A]" aria-hidden="true" />
          <ChevronRight className="w-3.5 h-3.5 text-[#1C3D5A]" aria-hidden="true" />
        </div>
      </div>

      {/* Corner captions */}
      <span className="absolute bottom-3 left-3 bg-[#1C3D5A]/80 text-white text-xs font-bold px-3 py-1 rounded-full pointer-events-none">
        Before
      </span>
      <span className="absolute bottom-3 right-3 bg-[#1C3D5A]/80 text-white text-xs font-bold px-3 py-1 rounded-full pointer-events-none">
        After
      </span>

      {/* Actual control: an invisible range input drives drag, touch, and keyboard */}
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-label={label}
        className="before-after-range absolute inset-0 w-full h-full appearance-none bg-transparent opacity-0 cursor-ew-resize m-0"
      />
    </div>
  );
}
