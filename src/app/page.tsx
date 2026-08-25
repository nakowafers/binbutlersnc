import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from 'next/link';
import Image from 'next/image';
import { calculatePricing, getSubscriptionDefinition, ONE_TIME_PRICE } from '@/lib/pricing';
import { Header } from "@/components/Header";

export const runtime = 'edge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  CheckCircle2, 
  MousePointer2, 
  Truck, 
  Sparkles, 
  Camera, 
  MessageCircle, 
  Star,
  Droplets,
  ShieldCheck,
  Clock
} from "lucide-react";

export default async function Home() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;

  if (role === 'ADMIN') {
    redirect('/admin');
  }

  const monthlyPrice = calculatePricing(1, 'monthly').recurringPrice;
  const bimonthlyPrice = calculatePricing(1, 'bimonthly').recurringPrice;
  const quarterlyPrice = calculatePricing(1, 'quarterly').recurringPrice;
  const monthlyName = getSubscriptionDefinition('monthly').customerFacingName;
  const bimonthlyName = getSubscriptionDefinition('bimonthly').customerFacingName;
  const quarterlyName = getSubscriptionDefinition('quarterly').customerFacingName;

  return (
    <div className="flex flex-col min-h-screen font-sans bg-[#F8FAFC]">
      {/* Header: Green Canvas with Top Navigation & 384px Titan Logo Medallion Overlap */}
      <Header />

      <main className="flex-grow">
        {/* Hero Section Designed for Titan Logo Overlap */}
        <section className="relative bg-[#F8FAFC] pt-36 sm:pt-48 md:pt-72 pb-24 text-center z-10 border-b border-slate-200">
          <div className="container mx-auto px-4 max-w-4xl">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-[#1C3D5A] mb-4 tracking-tight leading-tight text-balance">
              We Clean. You Relax. <br />
              <span className="text-[#7AC142]">Sparkling Clean Trash Cans.</span>
            </h1>
            <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto mb-8 font-medium text-pretty">
              Join thousands of satisfied North Carolina homeowners enjoying fresh, sanitized, and deodorized bins.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/signup" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto bg-[#7AC142] hover:bg-[#68a638] text-white rounded-xl h-14 px-10 text-lg font-bold shadow-lg shadow-lime-500/25 active:scale-95 transition-[transform,background-color,box-shadow]">
                  Select Your Plan
                </Button>
              </Link>
              <Link href="#pricing" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-auto border-2 border-[#1C3D5A] text-[#1C3D5A] hover:bg-[#1C3D5A] hover:text-white rounded-xl h-14 px-8 text-lg font-bold transition-colors">
                  Explore Pricing
                </Button>
              </Link>
            </div>

            {/* Quick Value Metrics */}
            <div className="mt-12 pt-8 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 text-[11px] sm:text-xs md:text-sm font-bold text-[#1C3D5A]">
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white py-2.5 sm:py-3 px-2 sm:px-4 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100">
                <Droplets className="w-4 h-4 text-[#7AC142]" aria-hidden="true" /> 200° Hot Water
              </div>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white py-2.5 sm:py-3 px-2 sm:px-4 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100">
                <ShieldCheck className="w-4 h-4 text-[#7AC142]" aria-hidden="true" /> 99.9% Sanitized
              </div>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white py-2.5 sm:py-3 px-2 sm:px-4 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100">
                <Clock className="w-4 h-4 text-[#7AC142]" aria-hidden="true" /> No Need To Be Home
              </div>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white py-2.5 sm:py-3 px-2 sm:px-4 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100">
                <Star className="w-4 h-4 text-[#7AC142] fill-[#7AC142]" aria-hidden="true" /> 100% Guaranteed
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24 bg-white scroll-mt-24">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-4 text-balance">
              How <span className="text-[#7AC142]">Bin Butlers</span> Works
            </h2>
            <p className="text-slate-600 mb-16 max-w-2xl mx-auto text-pretty">
              Experience the best in bin cleaning with our cutting-edge, three-step process.
            </p>
            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center p-8 bg-[#F8FAFC] rounded-3xl shadow-sm">
                <div className="w-16 h-16 bg-[#1C3D5A] text-[#7AC142] rounded-2xl flex items-center justify-center mb-6">
                  <MousePointer2 size={32} aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-[#1C3D5A] mb-3">Super Simple Sign-Up</h3>
                <p className="text-slate-600">Get scheduled in minutes, receive reminders, manage your cleaning days and more all on the go.</p>
              </div>
              <div className="flex flex-col items-center p-8 bg-[#F8FAFC] rounded-3xl shadow-sm">
                <div className="w-16 h-16 bg-[#1C3D5A] text-[#7AC142] rounded-2xl flex items-center justify-center mb-6">
                  <Truck size={32} aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-[#1C3D5A] mb-3">Curbside Wash</h3>
                <p className="text-slate-600">No need to be home, just have bins by the curb for your cleaning technician and we will run them through our eco-friendly process.</p>
              </div>
              <div className="flex flex-col items-center p-8 bg-[#F8FAFC] rounded-3xl shadow-sm">
                <div className="w-16 h-16 bg-[#1C3D5A] text-[#7AC142] rounded-2xl flex items-center justify-center mb-6">
                  <Sparkles size={32} aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-[#1C3D5A] mb-3">Bins Are Cleaned</h3>
                <p className="text-slate-600">Your bins are left sanitized, disinfected and deodorized. You will experience the Bin Butlers difference!</p>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="py-24 bg-[#F8FAFC] scroll-mt-24">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-6 text-balance">
                  We&apos;re Not Just Bin Cleaners, We Are <span className="text-[#7AC142]">Family First!</span>
                </h2>
                <p className="text-slate-600 mb-6 text-lg text-pretty">
                  Drawing from our own experiences, we recognize the paramount importance of prioritizing family well-being. Understanding the prevalent threats posed by bacterial and fungal infections in, on, and around dirty bins, we wholeheartedly dedicate ourselves to ensuring the safety and health of every household we serve.
                </p>
                <div className="space-y-4 mb-10">
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-[#7AC142] shrink-0" aria-hidden="true" />
                    <p className="font-semibold text-[#1C3D5A]">200-degree steam cleaning at over 2000 psi</p>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-[#7AC142] shrink-0" aria-hidden="true" />
                    <p className="font-semibold text-[#1C3D5A]">Eliminates 99.9% of bacteria and viruses</p>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-[#7AC142] shrink-0" aria-hidden="true" />
                    <p className="font-semibold text-[#1C3D5A]">Specially formulated odor-eliminating spray</p>
                  </div>
                </div>
                <Link href="#contact">
                  <Button className="bg-[#1C3D5A] hover:bg-[#152e44] text-white rounded-xl h-12 px-8 transition-colors active:scale-95">
                    Contact Us Today
                  </Button>
                </Link>
              </div>
              <div className="relative">
                <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl">
                  <Image
                    src="/assets/trash_bins_cleaning.png"
                    alt="Family First Cleaning"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
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

        {/* Pricing */}
        <section id="pricing" className="py-24 bg-white scroll-mt-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-4 text-balance">
                Choose Your <span className="text-[#7AC142]">Plan</span>
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto text-pretty">
                Select the service frequency that best fits your household needs.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Monthly - Featured */}
              <div className="flex flex-col p-10 bg-[#1C3D5A] rounded-[2.5rem] text-white shadow-2xl relative scale-100 md:scale-105">
                <div className="absolute top-0 right-10 -translate-y-1/2 bg-[#7AC142] text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                  Best for Year-Round Freshness
                </div>
                <h3 className="text-2xl font-bold mb-2">{monthlyName}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-white tabular-nums">${monthlyPrice}</span>
                  <span className="text-slate-300">/mo</span>
                </div>
                <p className="text-xs text-slate-300 mt-1 mb-6">
                  Up to 2 bins included. $5/mo per extra bin.
                </p>
                <p className="text-slate-300 mb-8">Our most frequent service for consistent, year-round care.</p>
                <ul className="space-y-4 mb-10 flex-grow">
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Cleaned every 4 weeks
                  </li>
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Sanitized & Deodorized
                  </li>
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Eco-friendly process
                  </li>
                </ul>
                <Link href="/signup?frequency=monthly" className="w-full">
                  <Button className="w-full bg-[#7AC142] hover:bg-[#68a638] text-white rounded-xl h-12 font-bold transition-colors shadow-lg shadow-lime-500/20 active:scale-95">
                    Select Plan
                  </Button>
                </Link>
              </div>

              {/* Bi-Monthly */}
              <div className="flex flex-col p-10 bg-[#F8FAFC] rounded-[2.5rem] border-2 border-transparent transition-all hover:border-[#7AC142] hover:shadow-xl group">
                <h3 className="text-2xl font-bold text-[#1C3D5A] mb-2">{bimonthlyName}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-[#1C3D5A] tabular-nums">${bimonthlyPrice}</span>
                  <span className="text-slate-500">/2 months</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-6">
                  Up to 2 bins included. $5/2mo per extra bin.
                </p>
                <p className="text-slate-600 mb-8">Great middle-ground for regular maintenance</p>
                <ul className="space-y-4 mb-10 flex-grow">
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Cleaned every 8 weeks
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Sanitized & Deodorized
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Eco-friendly process
                  </li>
                </ul>
                <Link href="/signup?frequency=bimonthly" className="w-full">
                  <Button className="w-full bg-[#1C3D5A] group-hover:bg-[#7AC142] text-white rounded-xl h-12 font-bold transition-colors active:scale-95">
                    Select Plan
                  </Button>
                </Link>
              </div>

              {/* Quarterly */}
              <div className="flex flex-col p-10 bg-[#F8FAFC] rounded-[2.5rem] border-2 border-transparent transition-all hover:border-[#7AC142] hover:shadow-xl group">
                <h3 className="text-2xl font-bold text-[#1C3D5A] mb-2">{quarterlyName}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-[#1C3D5A] tabular-nums">${quarterlyPrice}</span>
                  <span className="text-slate-500">/qtr</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-6">
                  Up to 2 bins included. $5/qtr per extra bin.
                </p>
                <p className="text-slate-600 mb-8">Perfect balance of value and hygiene</p>
                <ul className="space-y-4 mb-10 flex-grow">
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Cleaned every 12 weeks
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Sanitized & Deodorized
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Eco-friendly process
                  </li>
                </ul>
                <Link href="/signup?frequency=quarterly" className="w-full">
                  <Button className="w-full bg-[#1C3D5A] group-hover:bg-[#7AC142] text-white rounded-xl h-12 font-bold transition-colors active:scale-95">
                    Select Plan
                  </Button>
                </Link>
              </div>
            </div>

            {/* One-Time */}
            <div className="max-w-sm mx-auto mt-8">
              <div className="flex flex-col p-10 bg-[#F8FAFC] rounded-[2.5rem] border-2 border-transparent transition-all hover:border-[#7AC142] hover:shadow-xl group text-center">
                <h3 className="text-2xl font-bold text-[#1C3D5A] mb-2">One-Time</h3>
                <div className="flex items-baseline justify-center gap-1 mb-6">
                  <span className="text-4xl font-extrabold text-[#1C3D5A] tabular-nums">${ONE_TIME_PRICE}</span>
                  <span className="text-slate-500">/clean</span>
                </div>
                <p className="text-slate-600 mb-8">Great for a deep spring cleaning</p>
                <ul className="space-y-4 mb-10">
                  <li className="flex items-center justify-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Single deep clean
                  </li>
                  <li className="flex items-center justify-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> Sanitized & Deodorized
                  </li>
                  <li className="flex items-center justify-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" aria-hidden="true" /> No commitment
                  </li>
                </ul>
                <Link href="/signup?frequency=one-time" className="w-full">
                  <Button className="w-full bg-[#1C3D5A] group-hover:bg-[#7AC142] text-white rounded-xl h-12 font-bold transition-colors active:scale-95">
                    Order Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 bg-[#F8FAFC] scroll-mt-24">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-4 text-balance">Frequently Asked Questions</h2>
              <p className="text-slate-600 text-pretty">Everything you need to know about our service</p>
            </div>
            <Accordion className="space-y-4">
              <AccordionItem value="item-1" className="bg-white px-6 rounded-2xl border-none shadow-sm">
                <AccordionTrigger className="text-left font-bold text-[#1C3D5A] py-6 hover:no-underline">
                  Are my bins going to be empty when you arrive?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 pb-6">
                  Most garbage routes schedule different services at various times. We can almost guarantee that bins will be empty the next day, ready for a thorough cleaning.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="bg-white px-6 rounded-2xl border-none shadow-sm">
                <AccordionTrigger className="text-left font-bold text-[#1C3D5A] py-6 hover:no-underline">
                  Can I swap out which cans get cleaned?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 pb-6">
                  Specific cans designated for cleaning cannot be swapped at each service. We affix stickers to your bins to easily identify the ones scheduled for service.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="bg-white px-6 rounded-2xl border-none shadow-sm">
                <AccordionTrigger className="text-left font-bold text-[#1C3D5A] py-6 hover:no-underline">
                  How do I know my cleaning days?
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 pb-6">
                  You can check your account or opt-in for SMS alerts during sign-up to receive reminders the evening before and morning of service.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-[#1C3D5A] text-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-4xl font-extrabold mb-6 text-balance">Ready to become a Bin Butler client?</h2>
            <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto text-pretty">
              Join thousands of satisfied customers and experience the joy of a clean, odor-free bin.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="bg-[#7AC142] hover:bg-[#68a638] text-white rounded-xl h-14 px-10 text-lg font-bold transition-colors active:scale-95">
                  Get Scheduled
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer id="contact" className="bg-[#1C3D5A] text-white py-20 border-t border-white/10 scroll-mt-24">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-2 md:col-span-1">
              <Image src="/assets/logo.png" alt="Bin Butlers NC" width={1189} height={1251} className="h-12 w-auto mb-6" />
              <p className="text-slate-400 leading-relaxed">
                The premier trash bin cleaning service in North Carolina. We sanitize, disinfect, and deodorize your bins to keep your family safe and your home smelling fresh.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-6 text-[#7AC142]">Quick Links</h4>
              <ul className="space-y-2 text-slate-400">
                <li><Link href="#how-it-works" className="inline-flex items-center min-h-[44px] py-1 hover:text-white transition-colors">Our Process</Link></li>
                <li><Link href="#pricing" className="inline-flex items-center min-h-[44px] py-1 hover:text-white transition-colors">Pricing</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-6 text-[#7AC142]">Contact</h4>
              <ul className="space-y-2 text-slate-400">
                <li><a href="tel:9802408078" className="inline-flex items-center min-h-[44px] py-1 hover:text-white transition-colors">980-240-8078</a></li>
                <li><a href="mailto:info@binbutlersnc.com" className="inline-flex items-center min-h-[44px] py-1 hover:text-white transition-colors">info@binbutlersnc.com</a></li>
                <li className="inline-flex items-center min-h-[44px] py-1">Greater Charlotte Area</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-6 text-[#7AC142]">Follow Us</h4>
              <ul className="space-y-2 text-slate-400">
                <li>
                  <a href="https://instagram.com/binbutlersnc" target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-[44px] py-1 hover:text-white transition-colors gap-2">
                    <Camera size={18} aria-hidden="true" /> Instagram
                  </a>
                </li>
                <li>
                  <span className="text-slate-500 inline-flex items-center min-h-[44px] py-1 gap-2 cursor-not-allowed" aria-disabled="true" title="Facebook page coming soon">
                    <MessageCircle size={18} aria-hidden="true" /> Facebook (Coming Soon)
                  </span>
                </li>
                <li>
                  <a href="https://g.page/r/Cb0EUvVH2bAyEAI/review" target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-[44px] py-1 hover:text-white transition-colors gap-2">
                    <Star size={18} aria-hidden="true" /> Leave a Review
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/10 text-center text-slate-500 text-sm">
            <p>&copy; 2026 Bin Butlers NC. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
