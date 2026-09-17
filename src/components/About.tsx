import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';

// Source of record: about_us.md at the repo root. Keep the two in sync.
const PARAGRAPHS = [
  "My name is Evan Yanni, and I started this business at 21 years old — and yes, I dropped out of college to do it.",
  "That wasn't an easy decision. I've always had a passion for sales and working in the field, not sitting in a classroom waiting for a piece of paper to tell me I was ready. Choosing to leave school was stressful — but I knew if I was going to do this, I had to go all in. No half measures, no backup plan. Just commitment.",
  "So instead of finishing out a degree, I invested in a trash bin cleaning truck and started knocking on doors.",
  "What began as one guy and one truck has turned into a business I'm proud to run every single day.",
  "I do this work because I genuinely love serving my community. There's something simple and honest about taking care of a job most people don't want to think about — and doing it well enough that you never have to think about it either. Every driveway I leave cleaner, every bin I leave fresh, is a small way of showing up for the people in this town.",
  "I also do this work as an act of faith. I believe I'm called to serve — not just customers, but neighbors — and to do good, honest work as an offering, not just a paycheck. That belief is what gets me up early and keeps me consistent, even on the days nobody's watching.",
  "This business is still young, just like I am. But it's built on something solid: hard work, integrity, and a genuine desire to make this community a little cleaner and a little better, one bin at a time.",
];

export function About() {
  return (
    <section id="about" className="py-24 bg-[#F8FAFC] scroll-mt-24">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 lg:items-start">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-6 text-balance">
              Meet Evan, Your <span className="text-[#7AC142]">Bin Butler</span>
            </h2>
            <div className="space-y-5 text-slate-600 text-pretty max-w-[65ch] mb-10">
              {PARAGRAPHS.map((text, i) => (
                <p key={i} className={i === 0 ? "text-xl font-medium" : "text-lg"}>
                  {text}
                </p>
              ))}
            </div>
            <Link href="#contact">
              <Button className="bg-[#1C3D5A] hover:bg-[#152e44] text-white rounded-xl h-12 px-8 transition-colors active:scale-95">
                Contact Us Today
              </Button>
            </Link>
          </div>
          <div className="relative w-full max-w-md lg:ml-auto lg:sticky lg:top-8">
            {/* Source photo is 769×626 — aspect ratio matches exactly so nothing is cropped */}
            <div className="relative aspect-[769/626] rounded-3xl overflow-hidden shadow-2xl">
              <Image
                src="/assets/evan_cleaning.jpg"
                alt="Evan Yanni pressure-washing a trash bin beside the Bin Butlers cleaning truck"
                fill
                sizes="(max-width: 448px) 100vw, 448px"
                className="object-cover"
              />
            </div>
            <div className="absolute -bottom-6 left-2 sm:-bottom-8 sm:-left-8 max-w-[calc(100%-1rem)] bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl flex items-center gap-3 sm:gap-4">
              <div className="w-16 h-16 bg-[#7AC142] text-white rounded-2xl flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold tabular-nums">100%</span>
              </div>
              <div>
                <p className="font-bold text-[#1C3D5A]">Satisfaction</p>
                <p className="text-sm text-slate-500">Guaranteed</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
