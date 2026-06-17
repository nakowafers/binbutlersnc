'use client';

export const runtime = 'edge';

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
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from "sonner";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { normalizeSalesRepId } from "@/lib/sales-rep";
import { calculatePricing } from "@/lib/pricing";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { getTodayDateString, getMaximumDate, isTrashDayMatch, isWeekday } from "@/lib/date-utils";

const todayStr = getTodayDateString();
const maxDate = getMaximumDate();
const serviceableZips = (process.env.NEXT_PUBLIC_SERVICEABLE_ZIP_CODES || '')
    .split(',')
    .map(z => z.trim());

const signupSchema = z.object({
    first_name: z.string().trim().min(1, "First name is required").max(100),
    last_name: z.string().trim().min(1, "Last name is required").max(100),
    address: z.string().min(5, "Please enter a valid address"),
    lat: z.number().optional(),
    lng: z.number().optional(),
    zip_code: z.string().optional(),
    frequency: z.enum(['monthly', 'bimonthly', 'quarterly', 'one-time']),
    email: z.string().email("Please enter a valid email"),
    phone_number: z.string().min(10, "Please enter a valid phone number"),
    trash_day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI']),
    notes: z.string().optional(),
    bin_quantity: z.number().min(1, "Minimum 1 bin").max(10, "Maximum 10 bins"),
    scent_preference: z.enum(['lavender', 'ocean_breeze', 'tropical']),
    sales_rep_id: z.string().optional().transform(val => normalizeSalesRepId(val) ?? undefined).optional(),
    setup_fee_override: z.number().min(0, "Setup fee must be at least $0").optional(),
    next_service_date: z.string().optional(),
    tos_accepted: z.boolean().optional(),
    age_confirmed: z.boolean().optional(),
    contact_consent: z.boolean().optional(),
}).superRefine((data, ctx) => {
    if (data.address && data.address.length >= 5 && (data.lat === undefined || data.lng === undefined)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Please select an address from the autocomplete suggestions' });
    }
    if (data.zip_code && !serviceableZips.includes(data.zip_code)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Sorry, we don\'t service this area yet' });
    }
    if (data.next_service_date) {
        if (data.next_service_date < todayStr) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['next_service_date'], message: 'Service date cannot be in the past' });
        }
        if (data.next_service_date > maxDate) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['next_service_date'], message: 'Service date must be within 180 days' });
        }
        if (data.frequency !== 'one-time' && !isTrashDayMatch(data.next_service_date, data.trash_day)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['next_service_date'], message: `Service date must be a ${data.trash_day}` });
        }
        if (data.frequency === 'one-time' && !isWeekday(data.next_service_date)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['next_service_date'], message: 'Service date must be a weekday' });
        }
    }
    if (data.frequency === 'one-time') return;
    if (!data.tos_accepted) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tos_accepted'], message: 'You must accept the Terms of Service' });
    }
    if (!data.age_confirmed) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['age_confirmed'], message: 'You must confirm you are 18 or older' });
    }
    if (!data.contact_consent) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contact_consent'], message: 'You must agree to be contacted' });
    }
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
    const router = useRouter();
    const initialFrequency = searchParams.get('frequency') as 'monthly' | 'bimonthly' | 'quarterly' | null;
    const stepParam = searchParams.get('step');
    const step = stepParam ? Math.max(1, Math.min(3, parseInt(stepParam, 10) || 1)) : 1;
    const [isLoading, setIsLoading] = useState(false);
    const [canOverrideFee, setCanOverrideFee] = useState<boolean | null>(null);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const checkRepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


    const { register, handleSubmit, control, setValue, trigger, watch, reset, formState: { errors } } = useForm<SignupFormValues>({
        resolver: zodResolver(signupSchema),
        defaultValues: {
            first_name: '',
            last_name: '',
            frequency: (initialFrequency === 'monthly' || initialFrequency === 'bimonthly' || initialFrequency === 'quarterly' || initialFrequency === 'one-time') ? initialFrequency : 'monthly',
            bin_quantity: 1,
            scent_preference: 'lavender',
            trash_day: 'MON',
            setup_fee_override: 45,
            tos_accepted: false,
            age_confirmed: false,
            contact_consent: false,
            next_service_date: '',
        }
    });

    const address = useWatch({ control, name: 'address' });
    const frequency = useWatch({ control, name: 'frequency' });
    const binQuantity = useWatch({ control, name: 'bin_quantity' });
    const scentPreference = useWatch({ control, name: 'scent_preference' });
    const salesRepId = useWatch({ control, name: 'sales_rep_id' });
    const setupFeeOverride = useWatch({ control, name: 'setup_fee_override' }) ?? 45;
    const tosAccepted = useWatch({ control, name: 'tos_accepted' });
    const ageConfirmed = useWatch({ control, name: 'age_confirmed' });
    const contactConsent = useWatch({ control, name: 'contact_consent' });
    const trashDay = useWatch({ control, name: 'trash_day' });
    const nextServiceDate = useWatch({ control, name: 'next_service_date' });
    const { recurringPrice } = calculatePricing(binQuantity, frequency);
    useEffect(() => {
        if (checkRepTimerRef.current) {
            clearTimeout(checkRepTimerRef.current);
        }
        checkRepTimerRef.current = setTimeout(async () => {
            if (!salesRepId) {
                setCanOverrideFee(null);
                return;
            }
            try {
                const res = await fetch('/api/check-sales-rep', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sales_rep_id: normalizeSalesRepId(salesRepId) }),
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

    const STORAGE_KEY = 'signup_form_data';

    useEffect(() => {
        const sub = watch((values) => {
            try {
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values));
            } catch {
                // sessionStorage may be full or unavailable
            }
        });
        return () => sub.unsubscribe();
    }, [watch]);

    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as SignupFormValues;
                reset(parsed);
            }
        } catch {
            // Invalid stored data — start fresh
        }
    }, [reset]);

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
                sessionStorage.removeItem(STORAGE_KEY);
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



    const goToStep = (newStep: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('step', String(newStep));
        router.replace(`/signup?${params.toString()}`, { scroll: false });
    };

    const nextStep = async () => {
        const fieldsToValidate = step === 1
            ? ['first_name', 'last_name', 'address', 'trash_day', 'bin_quantity', 'scent_preference'] as const
            : ['email', 'phone_number'] as const;

        const isValid = await trigger(fieldsToValidate);
        if (isValid) {
            goToStep(step + 1);
        }
    };
    const prevStep = () => goToStep(step - 1);

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
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <Label htmlFor="first_name" className="text-[#1C3D5A] font-bold">First Name</Label>
                                        <Input
                                            id="first_name"
                                            {...register('first_name')}
                                            placeholder="John"
                                            className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                        />
                                        {errors.first_name && <p className="text-red-500 text-sm">{errors.first_name.message}</p>}
                                    </div>
                                    <div className="space-y-3">
                                        <Label htmlFor="last_name" className="text-[#1C3D5A] font-bold">Last Name</Label>
                                        <Input
                                            id="last_name"
                                            {...register('last_name')}
                                            placeholder="Doe"
                                            className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                        />
                                        {errors.last_name && <p className="text-red-500 text-sm">{errors.last_name.message}</p>}
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label htmlFor="address" className="text-[#1C3D5A] font-bold">Service Address</Label>
                                    <AddressAutocomplete
                                        id="address"
                                        {...register('address')}
                                        onAddressSelected={(formatted, lat, lng) => {
                                            setValue('address', formatted, { shouldValidate: true });
                                            setValue('lat', lat);
                                            setValue('lng', lng);
                                        }}
                                        onAddressCleared={() => {
                                            setValue('lat', undefined);
                                            setValue('lng', undefined);
                                            setValue('zip_code', '');
                                        }}
                                        onZipDetected={(zip) => {
                                            setValue('zip_code', zip, { shouldValidate: true });
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
                                    <Label htmlFor="notes" className="text-[#1C3D5A] font-bold">Notes / Special Instructions <span className="text-slate-400 font-normal text-sm">(optional)</span></Label>
                                    <Input
                                        id="notes"
                                        {...register('notes')}
                                        placeholder="e.g. Gate code: #1234, leave bins by garage"
                                        className="h-14 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <Label className="text-[#1C3D5A] font-bold">Trash Can Scent</Label>
                                    <RadioGroup
                                        value={scentPreference}
                                        onValueChange={(val) => setValue('scent_preference', val as "lavender" | "ocean_breeze" | "tropical")}
                                        className="grid gap-3"
                                    >
                                        {[
                                            { value: 'lavender', label: 'Lavender', description: 'Calming floral scent' },
                                            { value: 'ocean_breeze', label: 'Ocean Breeze', description: 'Fresh coastal air' },
                                            { value: 'tropical', label: 'Tropical', description: 'Exotic fruit medley' },
                                        ].map((scent) => (
                                            <div key={scent.value} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                                                scentPreference === scent.value ? 'border-[#7AC142] bg-lime-50' : 'border-slate-100 hover:border-slate-200'
                                            }`} onClick={() => setValue('scent_preference', scent.value as "lavender" | "ocean_breeze" | "tropical")}>
                                                <div className="flex items-center gap-4">
                                                    <RadioGroupItem value={scent.value} id={scent.value} className="text-[#7AC142]" />
                                                    <div>
                                                        <p className="font-bold text-[#1C3D5A]">{scent.label}</p>
                                                        <p className="text-sm text-slate-500">{scent.description}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </RadioGroup>
                                </div>

                                <div className="space-y-4">
                                    <Label className="text-[#1C3D5A] font-bold">Service Frequency</Label>
                                    <RadioGroup
                                        value={frequency}
                                        onValueChange={(val) => setValue('frequency', val as "monthly" | "bimonthly" | "quarterly" | "one-time")}
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
                                            frequency === 'bimonthly' ? 'border-[#7AC142] bg-lime-50' : 'border-slate-100 hover:border-slate-200'
                                        }`} onClick={() => setValue('frequency', 'bimonthly')}>
                                            <div className="flex items-center gap-4">
                                                <RadioGroupItem value="bimonthly" id="bimonthly" className="text-[#7AC142]" />
                                                <div>
                                                    <p className="font-bold text-[#1C3D5A]">Bi-Monthly Plan</p>
                                                    <p className="text-sm text-slate-500">Cleaned every 8 weeks</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-extrabold text-[#1C3D5A]">${calculatePricing(binQuantity, 'bimonthly').recurringPrice}</p>
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
                                                <p className="font-extrabold text-[#1C3D5A]">${calculatePricing(binQuantity, 'quarterly').recurringPrice}</p>
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
                                                <p className="font-extrabold text-[#1C3D5A]">${calculatePricing(binQuantity, 'one-time').setupFee}</p>
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
                                        {...register('sales_rep_id', {
                                            onChange: (e) => {
                                                e.target.value = e.target.value.toUpperCase();
                                            }
                                        })}
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

                                <div className="space-y-3">
                                    <Label htmlFor="next_service_date" className="text-[#1C3D5A] font-bold">Next Service Date</Label>
                                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                id="next_service_date"
                                                variant="outline"
                                                className={`w-full h-14 rounded-xl border-slate-200 justify-start text-left font-normal ${!nextServiceDate ? 'text-muted-foreground' : ''}`}
                                            >
                                                <CalendarIcon className="mr-2 size-4" />
                                                {nextServiceDate ? format(new Date(`${nextServiceDate}T12:00:00`), 'PPP') : 'Select a date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={nextServiceDate ? new Date(`${nextServiceDate}T12:00:00`) : undefined}
                                                onSelect={(date) => {
                                                    if (date) {
                                                        const dateStr = date.toISOString().split('T')[0];
                                                        setValue('next_service_date', dateStr, { shouldValidate: true });
                                                        setCalendarOpen(false);
                                                    }
                                                }}
                                                disabled={(date) => {
                                                    const dateStr = date.toISOString().split('T')[0];
                                                    if (dateStr < todayStr || dateStr > maxDate) return true;
                                                    if (frequency !== 'one-time') return !isTrashDayMatch(dateStr, trashDay);
                                                    return !isWeekday(dateStr);
                                                }}
                                                autoFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    {errors.next_service_date && <p className="text-red-500 text-sm">{errors.next_service_date.message}</p>}
                                </div>

                                <div className="p-4 bg-lime-50 rounded-2xl border border-lime-100 flex gap-4">
                                    <div className="text-[#7AC142] shrink-0 mt-1">
                                        <CheckCircle2 size={24} />
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        <strong>Summary:</strong> You&apos;re signing up for the <span className="capitalize">{frequency.replace('-', ' ')}</span> service for {binQuantity} bin{binQuantity > 1 ? 's' : ''}{address ? ` at ${address}` : ''}.
                                        <br /><br />
                                        <strong>Next Service Date:</strong> {nextServiceDate ? format(new Date(`${nextServiceDate}T12:00:00`), 'PPP') : 'Not set'}
                                        <br /><br />
                                        <strong>Total due today:</strong>
                                        {frequency === 'one-time' ? (
                                            <span className="text-[#1C3D5A] font-bold"> ${setupFeeOverride}</span>
                                        ) : (
                                            <span className="text-[#1C3D5A] font-bold"> ${setupFeeOverride}</span>
                                        )}
                                        <span className="text-xs text-slate-500 block mt-1">
                                            {frequency === 'one-time'
                                                ? `($${setupFeeOverride} flat-rate one-time clean${nextServiceDate ? ' on ' + format(new Date(nextServiceDate + 'T12:00:00'), 'PP') : ''})`
                                                : `($${setupFeeOverride} initial fee today + $${recurringPrice} flat-rate service ${nextServiceDate ? 'starting on ' + format(new Date(nextServiceDate + 'T12:00:00'), 'PP') : 'starting in ' + (frequency === 'monthly' ? 4 : frequency === 'bimonthly' ? 8 : 12) + ' weeks'})`}
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
                                        Review Agreement <ChevronRight size={20} className="ml-2" />
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
                                    <h3 className="font-bold text-[#1C3D5A] text-base">Service Agreement for {address}</h3>
                                    <p>This agreement confirms your <span className="capitalize font-semibold">{frequency}</span> subscription for {binQuantity} trash bin{binQuantity > 1 ? 's' : ''} at the address listed above.</p>

                                    <h4 className="font-bold text-[#1C3D5A]">1. Service Scope</h4>
                                    <p>Bin Butlers NC will provide professional cleaning, sanitizing, and deodorizing services for your specified trash bins. Service will occur on your municipal trash day ({trashDay}).</p>

                                    <h4 className="font-bold text-[#1C3D5A]">2. Billing & Renewal</h4>
                                    <p>You will be charged a one-time initial cleaning fee of ${setupFeeOverride} today. Your recurring subscription of ${recurringPrice} will begin on {nextServiceDate ? format(new Date(nextServiceDate + 'T12:00:00'), 'PPP') : 'your scheduled service date'} and will automatically renew until cancelled via the Stripe Customer Portal.</p>

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
