import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Env } from "@/lib/types";
import { StripeAdapter } from "@/lib/payment/StripeAdapter";

export const runtime = 'edge';

export default async function SuccessPage({
    searchParams,
}: {
    searchParams: Promise<{ session_id?: string }>;
}) {
    const params = await searchParams;
    const sessionId = params.session_id;

    let verification: { id: string; payment_status: string; customer_email: string | null; amount_total: number | null } | null = null;
    let error: string | null = null;

    if (sessionId) {
        try {
            const { env } = (getRequestContext() as unknown) as { env: Env };
            const paymentService = new StripeAdapter({
                secretKey: env.STRIPE_SECRET_KEY,
                monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
                quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
                oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
                setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
            });
            verification = await paymentService.retrieveCheckoutSession(sessionId);
        } catch (e) {
            error = (e as Error).message;
        }
    } else {
        error = "No session ID provided.";
    }

    const isPaid = verification?.payment_status === "paid";

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8 text-center">
                <div>
                    <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
                        {isPaid ? "Payment Successful!" : "Payment Confirmed"}
                    </h2>
                    {error ? (
                        <p className="mt-2 text-sm text-red-600">
                            Verification error: {error}
                        </p>
                    ) : (
                        <>
                            <p className="mt-2 text-sm text-gray-600">
                                Thank you for choosing Bin Butlers NC. Your service has been scheduled.
                            </p>
                            {verification?.customer_email && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Confirmation for: {verification.customer_email}
                                </p>
                            )}
                            {verification?.amount_total !== null && verification?.amount_total !== undefined && (
                                <p className="mt-1 text-xs text-gray-500">
                                    Amount: ${(verification.amount_total / 100).toFixed(2)}
                                </p>
                            )}
                        </>
                    )}
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
