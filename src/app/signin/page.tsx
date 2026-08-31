'use client';

export const runtime = 'edge';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail } from "lucide-react";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from "sonner";

export default function SignInPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#F8FAFC] py-12 sm:py-20 px-4 flex flex-col items-center justify-center">
                <Loader2 size={40} className="animate-spin text-[#7AC142]" />
            </div>
        }>
            <SignInForm />
        </Suspense>
    );
}

function SignInForm() {
    const searchParams = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || '/';
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        try {
            await signIn('google', { callbackUrl });
        } catch (error) {
            console.error('Google sign in error:', error);
            toast.error('Failed to sign in with Google.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await signIn('resend', { email, callbackUrl });
        } catch (error) {
            console.error('Sign in error:', error);
            toast.error('Failed to send magic link.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-12 sm:py-20 px-4 flex flex-col items-center justify-center">
            <Link href="/" className="mb-8 sm:mb-10">
                <Image src="/assets/logo.png" alt="Bin Butlers NC" width={1189} height={1251} className="h-14 sm:h-16 w-auto" />
            </Link>

            <Card className="w-full max-w-md border-none shadow-2xl rounded-2xl sm:rounded-[2.5rem] overflow-hidden">
                <CardHeader className="bg-[#1C3D5A] text-white p-6 sm:p-10 text-center">
                    <CardTitle className="text-2xl sm:text-3xl font-extrabold mb-2">Welcome Back</CardTitle>
                    <CardDescription className="text-slate-300">Sign in to manage your account.</CardDescription>
                </CardHeader>
                <CardContent className="p-6 sm:p-10 space-y-6">
                    <Button
                        onClick={handleGoogleSignIn}
                        disabled={isLoading}
                        variant="outline"
                        className="w-full h-12 sm:h-14 rounded-xl text-base sm:text-lg font-bold border-slate-200 hover:bg-slate-50 transition-all active:scale-95"
                    >
                        {isLoading ? (
                            <Loader2 size={20} className="mr-2 animate-spin" />
                        ) : (
                            <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                        )}
                        Continue with Google
                    </Button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-200" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-white px-4 text-slate-400">Or continue with email</span>
                        </div>
                    </div>

                    <form onSubmit={handleEmailSignIn} className="space-y-6">
                        <div className="space-y-3">
                            <Label htmlFor="email" className="text-[#1C3D5A] font-bold text-base sm:text-lg">Email Address</Label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="h-12 sm:h-14 pl-12 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                />
                            </div>
                        </div>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-[#7AC142] hover:bg-[#68a638] text-white h-12 sm:h-14 rounded-xl text-base sm:text-lg font-bold transition-all active:scale-95"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 size={20} className="mr-2 animate-spin" /> Sending Link...
                                </>
                            ) : (
                                'Send Magic Link'
                            )}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="p-6 sm:p-10 bg-slate-50 border-t text-center">
                    <p className="text-slate-500 w-full text-sm">
                        Don&apos;t have an account? <Link href="/signup" className="text-[#7AC142] font-bold hover:underline">Sign up today</Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
