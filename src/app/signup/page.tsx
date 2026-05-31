'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from "sonner";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

const signupSchema = z.object({
    address: z.string().min(5, "Please enter a valid address"),
    lat: z.number().optional(),
    lng: z.number().optional(),
    frequency: z.enum(['monthly', 'quarterly', 'one-time']),
    email: z.string().email("Please enter a valid email"),
    phone_number: z.string().min(10, "Please enter a valid phone number"),
    trash_day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI']),
    provider_name: z.string().optional(),
    bin_quantity: z.number().min(1, "Minimum 1 bin").max(10, "Maximum 10 bins"),
    sales_rep_id: z.string().optional(),
    setup_fee_override: z.number().min(1, "Setup fee must be at least $1").optional(),
    tos_accepted: z.boolean().optional(),
    age_confirmed: z.boolean().refine(v => v === true, { message: "You must confirm you are 18 or older" }),
    contact_consent: z.boolean().refine(v => v === true, { message: "You must agree to be contacted" }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-[#7AC142]" size={48} /></div>}>
            <SignupForm />
        </Suspense>
    );
}

function SignupForm() {
    const searchParams = useSearchParams();
    const initialFrequency = searchParams.get('frequency') as 'monthly' | 'quarterly' | null;

    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [canOverrideFee, setCanOverrideFee] = useState<boolean | null>(null);
    const checkRepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


    const { register, handleSubmit, control, setValue, trigger, formState: { errors } } = useForm<SignupFormValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: {
            frequency: (initialFrequency === 'monthly' || initialFrequency === 'quarterly' || initialFrequency === 'one-time') ? initialFrequency : 'monthly',
            bin_quantity: 1,
            trash_day: 'MON',
            setup_fee_override: 100,
            tos_accepted: false,
            age_confirmed: false,
            contact_consent: false,
        }
    });

    const address = useWatch({ control, name: 'address' });
    const frequency = useWatch({ control, name: 'frequency' });
    const binQuantity = useWatch({ control, name: 'bin_quantity' });
    const salesRepId = useWatch({ control, name: 'sales_rep_id' });
    const setupFeeOverride = useWatch({ control, name: 'setup_fee_override' }) ?? 100;
    const tosAccepted = useWatch({ control, name: 'tos_accepted' });
    const ageConfirmed = useWatch({ control, name: 'age_confirmed' });
    const contactConsent = useWatch({ control, name: 'contact_consent' });
    const trashDay = useWatch({ control, name: 'trash_day' });
    useEffect(() => {
        if (checkRepTimerRef.current) {
            clearTimeout(checkRepTimerRef.current);
        }
        if (!salesRepId) {
            setCanOverrideFee(null);
            return;
        }
        checkRepTimerRef.current = setTimeout(async () => {
            try {
                const res = await fetch('/api/check-sales-rep', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sales_rep_id: salesRepId }),
                });
                const data = await res.json() as { allowed: boolean };
                setCanOverrideFee(data.allowed);
            } catch {
                setCanOverrideFee(false);
            }
        }, 300);
        return () => {
            if (checkRepTimerRef.current) {
                clearTimeout(checkRepTimerRef.current);
            }
        };
    }, [salesRepId]);

    const onSubmit = async (data: SignupFormValues) => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                let errorMsg = 'Failed to initiate checkout.';
                try {
                    const errorData = await response.json() as { error?: string };
                    errorMsg = errorData.error || errorMsg;
                } catch (e) {
                    console.error('Non-JSON error response:', e);
                }
                toast.error(errorMsg);
                return;
            }

            const result = await response.json() as { url?: string };
            if (result.url) {
                window.location.assign(result.url);
            } else {
                toast.error('Something went wrong. Please try again.');
            }
        } catch (error) {
            console.error('Signup error:', error);
            toast.error('Failed to initiate checkout.');
        } finally {
            setIsLoading(false);
        }
    };



    const nextStep = async () => {
        const fieldsToValidate = step === 1
            ? ['address', 'trash_day', 'bin_quantity'] as const
            : ['email', 'phone_number'] as const;

        const isValid = await trigger(fieldsToValidate);
        if (isValid) {
            setStep(step + 1);
        }
    };
    const prevStep = () => setStep(step - 1);

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-12 px-4 flex flex-col items-center">
            <Link href="/" className="mb-8">
                <Image src="/assets/logo.png" alt="Bin Butlers NC" width={1189} height={1251} className="h-12 w-auto" />
            </Link>

            <div className="w-full max-w-xl">
                {/* Progress Bar */}
                <div className="flex items-center justify-between mb-8 px-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center">
                            {(i < 3 || (i === 3 && frequency !== 'one-time')) && (
                                <>
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                                        step >= i ? 'bg-[#7AC142] text-white shadow-lg shadow-lime-500/20' : 'bg-slate-200 text-slate-500'
                                    }`}>
                                        {step > i ? <CheckCircle2 size={20} /> : i}
                                    </div>
                                    {((i === 1) || (i === 2 && frequency !== 'one-time')) && (
                                        <div className={`w-24 md:w-48 h-1 mx-2 rounded-full transition-all ${
                                            step > i ? 'bg-[#7AC142]' : 'bg-slate-200'
                                        }`} />
                                    )}
                                </>
                            )}
                        </div>
                    ))}
                </div>

                <form onSubmit={handleSubmit(onSubmit)}>
                    {step === 1 && (
                        <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CardHeader className="bg-[#1C3D5A] text-white p-8">
                                <CardTitle className="text-2xl font-extrabold">Where should we clean?</CardTitle>
                                <CardDescription className="text-slate-300">Enter your address and choose your service plan.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8 space-y-8">
                                <div className="space-y-3">
                                    <Label htmlFor="address" className="text-[#1C3D5A] font-bold">Service Address</Label>
                                    <AddressAutocomplete
                                        id="address"
                                        {...register('address')}
                                        onAddressSelected={(formatted, lat, lng) => {
                                            setValue('address', formatted, { shouldValidate: true });
                                            if (lat !== undefined) setValue('lat', lat);
                                            if (lng !== undefined) setValue('lng', lng);
                                        }}
                                        placeholder="123 Butler Ln, Charlotte, NC"
                                        className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                    />
                                    {errors.address && <p className="text-red-500 text-sm">{errors.address.message}</p>}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <Label htmlFor="trash_day" className="text-[#1C3D5A] font-bold">Trash Day</Label>
                                        <select
                                            id="trash_day"
                                            {...register('trash_day')}
                                            className="w-full h-14 rounded-xl border-slate-200 border bg-white px-3 focus:ring-[#7AC142]"
                                        >
                                            <option value="MON">Monday</option>
                                            <option value="TUE">Tuesday</option>
                                            <option value="WED">Wednesday</option>
                                            <option value="THU">Thursday</option>
                                            <option value="FRI">Friday</option>
                                        </select>
                                    </div>
                                    <div className="space-y-3">
                                        <Label htmlFor="bin_quantity" className="text-[#1C3D5A] font-bold">How many bins?</Label>
                                        <Input
                                            id="bin_quantity"
                                            type="number"
                                            {...register('bin_quantity', { valueAsNumber: true })}
                                            className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label htmlFor="provider_name" className="text-[#1C3D5A] font-bold">Service Provider <span className="text-slate-400 font-normal text-sm">(optional)</span></Label>
                                    <Input
                                        id="provider_name"
                                        {...register('provider_name')}
                                        placeholder="e.g. Waste Management, City of Charlotte"
                                        className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <Label className="text-[#1C3D5A] font-bold">Service Frequency</Label>
                                    <RadioGroup
                                        value={frequency}
                                        onValueChange={(val) => setValue('frequency', val as "monthly" | "quarterly" | "one-time")}
                                        className="grid gap-4"
                                    >
                                        <div className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                                            frequency === 'monthly' ? 'border-[#7AC142] bg-lime-50' : 'border-slate-100 hover:border-slate-200'
                                        }`} onClick={() => setValue('frequency', 'monthly')}>
                                            <div className="flex items-center gap-4">
                                                <RadioGroupItem value="monthly" id="monthly" className="text-[#7AC142]" />
                                                <div>
                                                    <p className="font-bold text-[#1C3D5A]">Monthly Plan</p>
                                                    <p className="text-sm text-slate-500">Cleaned every 4 weeks</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-extrabold text-[#1C3D5A]">$30</p>
                                                <p className="text-xs text-slate-400">flat rate</p>
                                            </div>
                                        </div>

                                        <div className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                                            frequency === 'quarterly' ? 'border-[#7AC142] bg-lime-50' : 'border-slate-100 hover:border-slate-200'
                                        }`} onClick={() => setValue('frequency', 'quarterly')}>
                                            <div className="flex items-center gap-4">
                                                <RadioGroupItem value="quarterly" id="quarterly" className="text-[#7AC142]" />
                                                <div>
                                                    <p className="font-bold text-[#1C3D5A]">Quarterly Plan</p>
                                                    <p className="text-sm text-slate-500">Cleaned every 12 weeks</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-extrabold text-[#1C3D5A]">$40</p>
                                                <p className="text-xs text-slate-400">flat rate</p>
                                            </div>
                                        </div>

                                        <div className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                                            frequency === 'one-time' ? 'border-[#7AC142] bg-lime-50' : 'border-slate-100 hover:border-slate-200'
                                        }`} onClick={() => setValue('frequency', 'one-time')}>
                                            <div className="flex items-center gap-4">
                                                <RadioGroupItem value="one-time" id="one-time" className="text-[#7AC142]" />
                                                <div>
                                                    <p className="font-bold text-[#1C3D5A]">One-Time Clean</p>
                                                    <p className="text-sm text-slate-500">Single deep cleaning service</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-extrabold text-[#1C3D5A]">$100</p>
                                                <p className="text-xs text-slate-400">flat rate</p>
                                            </div>
                                        </div>
                                    </RadioGroup>
                                </div>
                            </CardContent>
                            <CardFooter className="p-8 bg-slate-50 border-t">
                                <Button
                                    type="button"
                                    onClick={nextStep}
                                    className="w-full bg-[#7AC142] hover:bg-[#68a638] text-white h-14 rounded-xl text-lg font-bold"
                                >
                                    Next Step <ChevronRight size={20} className="ml-2" />
                                </Button>
                            </CardFooter>
                        </Card>
                    )}

                    {step === 2 && (
                        <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
                            <CardHeader className="bg-[#1C3D5A] text-white p-8">
                                <CardTitle className="text-2xl font-extrabold">Final Details</CardTitle>
                                <CardDescription className="text-slate-300">Just a few more things before secure checkout.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8 space-y-6">
                                <div className="space-y-3">
                                    <Label htmlFor="email" className="text-[#1C3D5A] font-bold">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        {...register('email')}
                                        placeholder="you@example.com"
                                        className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                    />
                                    {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
                                </div>

                                <div className="space-y-3">
                                    <Label htmlFor="phone_number" className="text-[#1C3D5A] font-bold">Phone Number</Label>
                                    <Input
                                        id="phone_number"
                                        type="tel"
                                        {...register('phone_number')}
                                        placeholder="(704) 555-0123"
                                        className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                    />
                                    {errors.phone_number && <p className="text-red-500 text-sm">{errors.phone_number.message}</p>}
                                </div>

                                <div className="space-y-3">
                                    <Label htmlFor="sales_rep_id" className="text-[#1C3D5A] font-bold">Sales Rep ID (Optional)</Label>
                                    <Input
                                        id="sales_rep_id"
                                        {...register('sales_rep_id')}
                                        placeholder="REP123"
                                        className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                    />
                                </div>

                                {canOverrideFee && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <Label htmlFor="setup_fee_override" className="text-[#1C3D5A] font-bold">Initial Clean Fee ($)</Label>
                                        <Input
                                            id="setup_fee_override"
                                            type="number"
                                            min={1}
                                            {...register('setup_fee_override', { valueAsNumber: true })}
                                            className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                        />
                                        <p className="text-xs text-slate-500 italic">D2D Special: You can adjust the initial fee for this customer.</p>
                                    </div>
                                )}

                                <div className="p-4 bg-lime-50 rounded-2xl border border-lime-100 flex gap-4">
                                    <div className="text-[#7AC142] shrink-0 mt-1">
                                        <CheckCircle2 size={24} />
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        <strong>Summary:</strong> You&apos;re signing up for the <span className="capitalize">{frequency.replace('-', ' ')}</span> service for {binQuantity} bin{binQuantity > 1 ? 's' : ''}{address ? ` at ${address}` : ''}.
                                        <br /><br />
                                        <strong>Total due today:</strong>
                                        {frequency === 'one-time' ? (
                                            <span className="text-[#1C3D5A] font-bold"> ${setupFeeOverride}</span>
                                        ) : (
                                            <span className="text-[#1C3D5A] font-bold"> ${setupFeeOverride}</span>
                                        )}
                                        <span className="text-xs text-slate-500 block mt-1">
                                            {frequency === 'one-time'
                                                ? `($${setupFeeOverride} flat-rate one-time clean)`
                                                : `($${setupFeeOverride} initial fee today + $${frequency === 'monthly' ? 30 : 40} flat-rate service starting in ${frequency === 'monthly' ? 4 : 12} weeks)`}
                                        </span>
                                    </p>
                                </div>
                            </CardContent>
                            <CardFooter className="p-8 bg-slate-50 border-t flex gap-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={prevStep}
                                    className="h-14 rounded-xl border-slate-200 text-[#1C3D5A]"
                                >
                                    <ChevronLeft size={20} />
                                </Button>
                                {frequency === 'one-time' ? (
                                    <Button
                                        type="submit"
                                        disabled={isLoading}
                                        className="flex-grow bg-[#7AC142] hover:bg-[#68a638] text-white h-14 rounded-xl text-lg font-bold"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 size={20} className="mr-2 animate-spin" /> Processing...
                                            </>
                                        ) : (
                                            'Go to Payment'
                                        )}
                                    </Button>
                                ) : (
                                    <Button
                                        type="button"
                                        onClick={nextStep}
                                        className="flex-grow bg-[#7AC142] hover:bg-[#68a638] text-white h-14 rounded-xl text-lg font-bold"
                                    >
                                        Review Contract <ChevronRight size={20} className="ml-2" />
                                    </Button>
                                )}
                            </CardFooter>
                        </Card>
                    )}

                    {step === 3 && frequency !== 'one-time' && (
                        <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
                            <CardHeader className="bg-[#1C3D5A] text-white p-8">
                                <CardTitle className="text-2xl font-extrabold">Service Agreement</CardTitle>
                                <CardDescription className="text-slate-300">Please review and accept our service terms.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8 space-y-6">
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 h-64 overflow-y-auto text-sm text-slate-600 space-y-4 leading-relaxed scrollbar-thin scrollbar-thumb-slate-300">
                                    <h3 className="font-bold text-[#1C3D5A] text-base">Service Contract for {address}</h3>
                                    <p>This agreement confirms your <span className="capitalize font-semibold">{frequency}</span> subscription for {binQuantity} trash bin{binQuantity > 1 ? 's' : ''} at the address listed above.</p>

                                    <h4 className="font-bold text-[#1C3D5A]">1. Service Scope</h4>
                                    <p>Bin Butlers NC will provide professional cleaning, sanitizing, and deodorizing services for your specified trash bins. Service will occur on your municipal trash day ({trashDay}).</p>

                                    <h4 className="font-bold text-[#1C3D5A]">2. Billing & Renewal</h4>
                                    <p>You will be charged a one-time initial cleaning fee of ${setupFeeOverride} today. Your recurring subscription of ${frequency === 'monthly' ? 30 : 40} will begin in {frequency === 'monthly' ? 4 : 12} weeks and will automatically renew until cancelled via the Stripe Customer Portal.</p>

                                    <h4 className="font-bold text-[#1C3D5A]">3. Customer Obligations</h4>
                                    <p>Customers must leave their bins at the curb or in a visible, accessible location on the scheduled service day. If bins are not accessible, service may be skipped and rescheduled for the following week.</p>

                                    <h4 className="font-bold text-[#1C3D5A]">4. Termination</h4>
                                    <p>You may cancel your subscription at any time through your account settings or the Stripe billing portal. Cancellations must be made at least 48 hours prior to the next scheduled service date.</p>

                                    <p className="pt-4 border-t border-slate-200 italic">By checking the box below, you acknowledge that you have read, understood, and agreed to be bound by these terms.</p>
                                </div>

                                <div className="flex items-start gap-3 p-4 bg-lime-50 rounded-xl border border-lime-100">
                                    <div className="flex items-center h-6">
                                        <input
                                            id="age_confirmed"
                                            type="checkbox"
                                            {...register('age_confirmed')}
                                            className="h-5 w-5 rounded border-slate-300 text-[#7AC142] focus:ring-[#7AC142] transition-all cursor-pointer"
                                        />
                                    </div>
                                    <Label htmlFor="age_confirmed" className="text-sm text-slate-700 leading-snug cursor-pointer font-medium">
                                        I confirm I am 18 years of age or older.
                                    </Label>
                                </div>
                                {errors.age_confirmed && <p className="text-red-500 text-xs font-medium pl-1">{errors.age_confirmed.message}</p>}

                                <div className="flex items-start gap-3 p-4 bg-lime-50 rounded-xl border border-lime-100">
                                    <div className="flex items-center h-6">
                                        <input
                                            id="tos_accepted"
                                            type="checkbox"
                                            {...register('tos_accepted')}
                                            className="h-5 w-5 rounded border-slate-300 text-[#7AC142] focus:ring-[#7AC142] transition-all cursor-pointer"
                                        />
                                    </div>
                                    <Label htmlFor="tos_accepted" className="text-sm text-slate-700 leading-snug cursor-pointer font-medium">
                                        I have read and agree to the Service Agreement and Terms of Service.
                                    </Label>
                                </div>
                                {errors.tos_accepted && <p className="text-red-500 text-xs font-medium pl-1">{errors.tos_accepted.message}</p>}

                                <div className="flex items-start gap-3 p-4 bg-lime-50 rounded-xl border border-lime-100">
                                    <div className="flex items-center h-6">
                                        <input
                                            id="contact_consent"
                                            type="checkbox"
                                            {...register('contact_consent')}
                                            className="h-5 w-5 rounded border-slate-300 text-[#7AC142] focus:ring-[#7AC142] transition-all cursor-pointer"
                                        />
                                    </div>
                                    <Label htmlFor="contact_consent" className="text-sm text-slate-700 leading-snug cursor-pointer font-medium">
                                        I consent to being contacted regarding my service and account.
                                    </Label>
                                </div>
                                {errors.contact_consent && <p className="text-red-500 text-xs font-medium pl-1">{errors.contact_consent.message}</p>}
                            </CardContent>
                            <CardFooter className="p-8 bg-slate-50 border-t flex gap-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={prevStep}
                                    className="h-14 rounded-xl border-slate-200 text-[#1C3D5A]"
                                >
                                    <ChevronLeft size={20} />
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isLoading || !tosAccepted || !ageConfirmed || !contactConsent}
                                    className="flex-grow bg-[#7AC142] hover:bg-[#68a638] text-white h-14 rounded-xl text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 size={20} className="mr-2 animate-spin" /> Processing...
                                        </>
                                    ) : (
                                        'Go to Payment'
                                    )}
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                </form>
            </div>
        </div>
    );
}
