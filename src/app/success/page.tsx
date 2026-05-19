import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SuccessPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 text-center">
        <div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
            Payment Successful!
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Thank you for choosing Bin Butlers NC. Your service has been scheduled.
          </p>
        </div>
        <div className="mt-8">
          <Link href="/portal">
            <Button className="w-full">
              Go to Customer Portal
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
