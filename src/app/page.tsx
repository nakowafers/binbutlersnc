import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Header } from '@/components/Header';
import Link from 'next/link';
import Image from 'next/image';
import { calculatePricing, ONE_TIME_PRICE } from '@/lib/pricing';

export const runtime = 'edge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CheckCircle2, MousePointer2, Truck, Sparkles } from "lucide-react";

export default async function Home() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;

  if (role === 'ADMIN') {
    redirect('/admin');
  }

  const monthlyPrice = calculatePricing(1, 'monthly').recurringPrice;
  const bimonthlyPrice = calculatePricing(1, 'bimonthly').recurringPrice;
  const quarterlyPrice = calculatePricing(1, 'quarterly').recurringPrice;
  return (
    <div className="flex flex-col min-h-screen font-sans bg-[#F8FAFC]">
      <Header />

      <main className="flex-grow">
        {/* Hero Section */}
        <section className="relative py-20 lg:py-32 overflow-hidden bg-[#1C3D5A] text-white">
          <div className="absolute inset-0 opacity-20 bg-[url('/assets/trash_bins_cleaning.png')] bg-cover bg-center" />
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl">
              <span className="inline-block bg-[#7AC142] text-white text-sm font-bold px-4 py-1.5 rounded-full mb-6">
                Top-Rated Cleaning Service
              </span>
              <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
                We Serve. You Save Time. <br />
                <span className="text-[#7AC142]">Never Smell A Stinky Bin Again.</span>
              </h1>
              <p className="text-lg md:text-xl text-slate-200 mb-10 max-w-2xl">
                Our goal is not only to keep our community safe, but to keep all the homeowners and families alike from ever smelling a stinky bin again.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="#how-it-works">
                  <Button size="lg" className="bg-[#7AC142] hover:bg-[#68a638] text-white rounded-xl h-14 px-8 text-lg font-bold transition-all active:scale-95">
                    Our Process
                  </Button>
                </Link>
                <Link href="#pricing">
                  <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white/10 rounded-xl h-14 px-8 text-lg font-bold transition-all active:scale-95">
                    View Pricing
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-24 bg-white">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-4">
              How <span className="text-[#7AC142]">Bin Butlers</span> Works
            </h2>
            <p className="text-slate-600 mb-16 max-w-2xl mx-auto">
              Experience the best in bin cleaning with our cutting-edge, three-step process.
            </p>
            <div className="grid md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center p-8 bg-[#F8FAFC] rounded-3xl shadow-sm">
                <div className="w-16 h-16 bg-[#1C3D5A] text-[#7AC142] rounded-2xl flex items-center justify-center mb-6">
                  <MousePointer2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-[#1C3D5A] mb-3">Super Simple Sign-Up</h3>
                <p className="text-slate-600">Get scheduled in minutes, receive reminders, manage your cleaning days and more all on the go.</p>
              </div>
              <div className="flex flex-col items-center p-8 bg-[#F8FAFC] rounded-3xl shadow-sm">
                <div className="w-16 h-16 bg-[#1C3D5A] text-[#7AC142] rounded-2xl flex items-center justify-center mb-6">
                  <Truck size={32} />
                </div>
                <h3 className="text-xl font-bold text-[#1C3D5A] mb-3">Curbside Wash</h3>
                <p className="text-slate-600">No need to be home, just have bins by the curb for your cleaning technician and we will run them through our eco-friendly process.</p>
              </div>
              <div className="flex flex-col items-center p-8 bg-[#F8FAFC] rounded-3xl shadow-sm">
                <div className="w-16 h-16 bg-[#1C3D5A] text-[#7AC142] rounded-2xl flex items-center justify-center mb-6">
                  <Sparkles size={32} />
                </div>
                <h3 className="text-xl font-bold text-[#1C3D5A] mb-3">Bins Are Cleaned</h3>
                <p className="text-slate-600">Your bins are left sanitized, disinfected and deodorized. You will experience the Bin Butlers difference!</p>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="py-24 bg-[#F8FAFC]">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-6">
                  We&apos;re Not Just Bin Cleaners, We Are <span className="text-[#7AC142]">Family First!</span>
                </h2>
                <p className="text-slate-600 mb-6 text-lg">
                  Drawing from our own experiences, we recognize the paramount importance of prioritizing family well-being. Understanding the prevalent threats posed by bacterial and fungal infections in, on, and around dirty bins, we wholeheartedly dedicate ourselves to ensuring the safety and health of every household we serve.
                </p>
                <div className="space-y-4 mb-10">
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-[#7AC142] shrink-0" />
                    <p className="font-semibold text-[#1C3D5A]">200-degree steam cleaning at over 2000 psi</p>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-[#7AC142] shrink-0" />
                    <p className="font-semibold text-[#1C3D5A]">Eliminates 99.9% of bacteria and viruses</p>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="text-[#7AC142] shrink-0" />
                    <p className="font-semibold text-[#1C3D5A]">Specially formulated odor-eliminating spray</p>
                  </div>
                </div>
                <Link href="#contact">
                  <Button className="bg-[#1C3D5A] hover:bg-[#152e44] text-white rounded-xl h-12 px-8 transition-all active:scale-95">
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
                <div className="absolute -bottom-8 -left-8 bg-white p-6 rounded-3xl shadow-xl flex items-center gap-4">
                  <div className="w-16 h-16 bg-[#7AC142] text-white rounded-2xl flex items-center justify-center">
                    <span className="text-2xl font-bold">100%</span>
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
        <section id="pricing" className="py-24 bg-white">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-4">
                Choose Your <span className="text-[#7AC142]">Plan</span>
              </h2>
              <p className="text-slate-600 max-w-2xl mx-auto">
                Select the service frequency that best fits your household needs.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Monthly */}
              <div className="flex flex-col p-10 bg-[#F8FAFC] rounded-[2.5rem] border-2 border-transparent transition-all hover:border-[#7AC142] hover:shadow-xl group">
                <h3 className="text-2xl font-bold text-[#1C3D5A] mb-2">Monthly</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-[#1C3D5A]">${monthlyPrice}</span>
                  <span className="text-slate-500">/mo</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-6">
                  Up to 2 bins included. $5/mo per extra bin.
                </p>
                <p className="text-slate-600 mb-8">Best for keeping bins fresh year-round</p>
                <ul className="space-y-4 mb-10 flex-grow">
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Cleaned every 4 weeks
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Sanitized & Deodorized
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Eco-friendly process
                  </li>
                </ul>
                <Link href="/signup?frequency=monthly" className="w-full">
                  <Button className="w-full bg-[#1C3D5A] group-hover:bg-[#7AC142] text-white rounded-xl h-12 font-bold transition-all active:scale-95">
                    Select Plan
                  </Button>
                </Link>
              </div>

              {/* Bi-Monthly - Featured */}
              <div className="flex flex-col p-10 bg-[#1C3D5A] rounded-[2.5rem] text-white shadow-2xl relative scale-105">
                <div className="absolute top-0 right-10 -translate-y-1/2 bg-[#7AC142] text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
                <h3 className="text-2xl font-bold mb-2">Bi-Monthly</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-white">${bimonthlyPrice}</span>
                  <span className="text-slate-400">/2 months</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-6">
                  Up to 2 bins included. $5/2mo per extra bin.
                </p>
                <p className="text-slate-300 mb-8">Great middle-ground for regular maintenance</p>
                <ul className="space-y-4 mb-10 flex-grow">
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Cleaned every 8 weeks
                  </li>
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Sanitized & Deodorized
                  </li>
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Eco-friendly process
                  </li>
                </ul>
                <Link href="/signup?frequency=bimonthly" className="w-full">
                  <Button className="w-full bg-[#7AC142] hover:bg-[#68a638] text-white rounded-xl h-12 font-bold transition-all shadow-lg shadow-lime-500/20 active:scale-95">
                    Select Plan
                  </Button>
                </Link>
              </div>

              {/* Quarterly */}
              <div className="flex flex-col p-10 bg-[#F8FAFC] rounded-[2.5rem] border-2 border-transparent transition-all hover:border-[#7AC142] hover:shadow-xl group">
                <h3 className="text-2xl font-bold text-[#1C3D5A] mb-2">Quarterly</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-extrabold text-[#1C3D5A]">${quarterlyPrice}</span>
                  <span className="text-slate-500">/qtr</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-6">
                  Up to 2 bins included. $5/qtr per extra bin.
                </p>
                <p className="text-slate-600 mb-8">Perfect balance of value and hygiene</p>
                <ul className="space-y-4 mb-10 flex-grow">
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Cleaned every 12 weeks
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Sanitized & Deodorized
                  </li>
                  <li className="flex items-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Eco-friendly process
                  </li>
                </ul>
                <Link href="/signup?frequency=quarterly" className="w-full">
                  <Button className="w-full bg-[#1C3D5A] group-hover:bg-[#7AC142] text-white rounded-xl h-12 font-bold transition-all active:scale-95">
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
                  <span className="text-4xl font-extrabold text-[#1C3D5A]">${ONE_TIME_PRICE}</span>
                  <span className="text-slate-500">/clean</span>
                </div>
                <p className="text-slate-600 mb-8">Great for a deep spring cleaning</p>
                <ul className="space-y-4 mb-10">
                  <li className="flex items-center justify-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Single deep clean
                  </li>
                  <li className="flex items-center justify-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> Sanitized & Deodorized
                  </li>
                  <li className="flex items-center justify-center gap-3 text-slate-600">
                    <CheckCircle2 size={18} className="text-[#7AC142]" /> No commitment
                  </li>
                </ul>
                <Link href="/signup?frequency=one-time" className="w-full">
                  <Button className="w-full bg-[#1C3D5A] group-hover:bg-[#7AC142] text-white rounded-xl h-12 font-bold transition-all active:scale-95">
                    Order Now
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="py-24 bg-[#F8FAFC]">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-extrabold text-[#1C3D5A] mb-4">Frequently Asked Questions</h2>
              <p className="text-slate-600">Everything you need to know about our service</p>
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
            <h2 className="text-4xl font-extrabold mb-6">Ready to become a Bin Butler client?</h2>
            <p className="text-xl text-slate-300 mb-10 max-w-2xl mx-auto">
              Join thousands of satisfied customers and experience the joy of a clean, odor-free bin.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="bg-[#7AC142] hover:bg-[#68a638] text-white rounded-xl h-14 px-10 text-lg font-bold transition-all active:scale-95">
                  Get Scheduled
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer id="contact" className="bg-[#1C3D5A] text-white py-20 border-t border-white/10">
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
              <ul className="space-y-4 text-slate-400">
                <li><Link href="#how-it-works" className="hover:text-white transition-colors">Our Process</Link></li>
                <li><Link href="#pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                {/* TODO: re-enable Sign In
                <li><Link href="/signin" className="hover:text-white transition-colors">Sign In</Link></li>
                */}
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-6 text-[#7AC142]">Contact</h4>
              <ul className="space-y-4 text-slate-400">
                <li><a href="tel:9802408078" className="hover:text-white transition-colors">980-240-8078</a></li>
                <li><a href="mailto:info@binbutlersnc.com" className="hover:text-white transition-colors">info@binbutlersnc.com</a></li>
                <li>Greater Charlotte Area</li>
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
