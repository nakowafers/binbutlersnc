import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';
import { StripeAdapter } from '@/lib/payment/StripeAdapter';
import { validateOrigin } from '@/lib/csrf';

export const runtime = 'edge';

export async function PATCH(request: Request) {
    try {
        if (!validateOrigin(request)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const session = await auth();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json() as {
            customerId: string;
            addressId: string;
            firstName?: string;
            lastName?: string;
            phoneNumber?: string;
            rawAddress?: string;
            latitude?: number | null;
            longitude?: number | null;
            trashDay?: string;
            notes?: string;
            scentPreference?: string;
        };

        if (!body.customerId) {
            return NextResponse.json({ error: 'Missing customerId' }, { status: 400 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        const db = new D1DatabaseAdapter(env.DB);

        // Update customer fields if provided
        const hasCustomerUpdates = body.firstName !== undefined || body.lastName !== undefined || body.phoneNumber !== undefined;
        if (hasCustomerUpdates) {
            await db.updateCustomer(body.customerId, {
                firstName: body.firstName,
                lastName: body.lastName,
                phoneNumber: body.phoneNumber,
            });
        }

        // Update address fields if addressId provided
        const hasAddressUpdates = body.rawAddress !== undefined || body.latitude !== undefined || body.longitude !== undefined || body.trashDay !== undefined || body.notes !== undefined || body.scentPreference !== undefined;
        if (body.addressId && hasAddressUpdates) {
            await db.updateAddress(body.addressId, {
                rawAddress: body.rawAddress,
                latitude: body.latitude,
                longitude: body.longitude,
                trashDay: body.trashDay,
                notes: body.notes,
                scentPreference: body.scentPreference,
            });
        }

        // Update Stripe customer metadata if stripe_customer_id exists
        const stripeCustomerId = await db.getStripeCustomerId(body.customerId);
        if (stripeCustomerId) {
            const [customer, address] = await Promise.all([
                db.getCustomerById(body.customerId),
                body.addressId ? db.getAddressById(body.addressId) : null,
            ]);

            if (customer) {
                const stripeKey = env.STRIPE_SECRET_KEY;
                if (!stripeKey || stripeKey.includes('sk_test_...')) {
                    return NextResponse.json({ error: 'Stripe API key not configured' }, { status: 500 });
                }

                const paymentService = new StripeAdapter({
                    secretKey: stripeKey,
                    monthlyPriceId: env.STRIPE_MONTHLY_PRICE_ID,
                    bimonthlyPriceId: env.STRIPE_BIMONTHLY_PRICE_ID,
                    quarterlyPriceId: env.STRIPE_QUARTERLY_PRICE_ID,
                    oneTimePriceId: env.STRIPE_ONETIME_PRICE_ID,
                    setupFeePriceId: env.STRIPE_SETUP_FEE_PRICE_ID,
                });

                const mergedAddress = address?.raw_address || body.rawAddress || '';
                const mergedTrashDay = body.trashDay || address?.trash_day || '';
                const mergedLat = body.latitude !== undefined ? body.latitude : address?.latitude ?? null;
                const mergedLng = body.longitude !== undefined ? body.longitude : address?.longitude ?? null;

                const firstName = body.firstName ?? customer.first_name ?? '';
                const lastName = body.lastName ?? customer.last_name ?? '';
                const combinedName = `${firstName} ${lastName}`.trim();

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (paymentService as any).updateCustomerServiceDetails(stripeCustomerId, {
                    name: combinedName || undefined,
                    firstName,
                    lastName,
                    address: mergedAddress || '',
                    trashDay: mergedTrashDay,
                    notes: body.notes ?? address?.notes ?? '',
                    scentPreference: body.scentPreference ?? address?.scent_preference ?? '',
                    phoneNumber: body.phoneNumber ?? customer.phone_number ?? '',
                    lat: mergedLat,
                    lng: mergedLng,
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Admin customer update error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
