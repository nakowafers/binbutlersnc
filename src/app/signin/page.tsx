'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail } from "lucide-react";
import Link from 'next/link';
import { toast } from "sonner";

export default function SignInPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await signIn('resend', { email, callbackUrl: '/portal' });
        } catch (error) {
            console.error('Sign in error:', error);
            toast.error('Failed to send magic link.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] py-20 px-4 flex flex-col items-center justify-center">
            <Link href="/" className="mb-10">
                <img src="/assets/logo.png" alt="Bin Butlers NC" className="h-16 w-auto" />
            </Link>

            <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
                <CardHeader className="bg-[#1C3D5A] text-white p-10 text-center">
                    <CardTitle className="text-3xl font-extrabold mb-2">Welcome Back</CardTitle>
                    <CardDescription className="text-slate-300">Enter your email to receive a secure login link.</CardDescription>
                </CardHeader>
                <CardContent className="p-10">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-3">
                            <Label htmlFor="email" className="text-[#1C3D5A] font-bold text-lg">Email Address</Label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="h-14 pl-12 rounded-xl border-slate-200 focus:ring-[#7AC142]"
                                />
                            </div>
                        </div>
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-[#7AC142] hover:bg-[#68a638] text-white h-14 rounded-xl text-lg font-bold transition-all active:scale-95"
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
                <CardFooter className="p-10 bg-slate-50 border-t text-center">
                    <p className="text-slate-500 w-full text-sm">
                        Don&apos;t have an account? <Link href="/signup" className="text-[#7AC142] font-bold hover:underline">Sign up today</Link>
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
