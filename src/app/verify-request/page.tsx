import Link from "next/link";
import { Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function VerifyRequestPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] py-20 px-4 flex flex-col items-center justify-center">
      <Link href="/" className="mb-10">
        <img src="/assets/logo.png" alt="Bin Butlers NC" className="h-16 w-auto" />
      </Link>

      <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="bg-[#1C3D5A] text-white p-10 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-[#7AC142] rounded-full p-3">
              <Mail size={32} className="text-white" />
            </div>
          </div>
          <CardTitle className="text-3xl font-extrabold mb-2">Check Your Email</CardTitle>
          <CardDescription className="text-slate-300">
            A secure sign-in link has been sent to your email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-10 space-y-6">
          <p className="text-slate-600 text-center leading-relaxed">
            Click the link in the email to sign in to your account. If you don&apos;t see the email, check your spam folder.
          </p>
          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-500">
            <p className="font-medium text-[#1C3D5A] mb-1">Didn&apos;t receive the email?</p>
            <p>
              The link expires after a few minutes for security. You can{" "}
              <Link href="/signin" className="text-[#7AC142] font-bold hover:underline">
                request a new one
              </Link>
              .
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
