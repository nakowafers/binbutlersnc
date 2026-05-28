import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { Env, Customer, Address } from '@/lib/types';
import { D1DatabaseAdapter } from '@/lib/db/D1DatabaseAdapter';

export const runtime = 'edge';

const VALID_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session || !session.user || !session.user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { env } = (getRequestContext() as unknown) as { env: Env };
        const body = await request.json() as {
            serviceDay?: string;
            trashDay?: string;
            gateCode?: string;
            hoaName?: string;
            accessNotes?: string;
        };

        // 1. Validate service day if provided
        if (body.serviceDay && !VALID_DAYS.includes(body.serviceDay.toUpperCase())) {
            return NextResponse.json(
                { error: 'Invalid service day. Must be MON, TUE, WED, THU, or FRI.' },
                { status: 400 }
            );
        }

        // 2. Validate trash day if provided
        if (body.trashDay && !VALID_DAYS.includes(body.trashDay.toUpperCase())) {
            return NextResponse.json(
                { error: 'Invalid trash day. Must be MON, TUE, WED, THU, or FRI.' },
                { status: 400 }
            );
        }

        const db = new D1DatabaseAdapter(env.DB);

        // 3. Fetch customer using session email
        const customer = await db.getCustomerByEmail(session.user.email);

        if (!customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        if (!customer.address_id) {
            return NextResponse.json({ error: 'No address associated with this customer profile' }, { status: 400 });
        }

        // 4. Fetch the existing address to verify
        const address = await db.getAddressById(customer.address_id);

        if (!address) {
            return NextResponse.json({ error: 'Address record not found' }, { status: 404 });
        }

        // 5. Update fields via Adapter. Keep existing values if not provided in request body.
        const serviceDay = body.serviceDay !== undefined ? body.serviceDay.toUpperCase() : address.service_day;
        const trashDay = body.trashDay !== undefined ? body.trashDay.toUpperCase() : address.trash_day;
        const gateCode = body.gateCode !== undefined ? body.gateCode : address.gate_code;
        const hoaName = body.hoaName !== undefined ? body.hoaName : address.hoa_name;
        const accessNotes = body.accessNotes !== undefined ? body.accessNotes : address.access_notes;

        await db.updateAddressDetails(customer.address_id, {
            serviceDay,
            trashDay,
            gateCode,
            hoaName,
            accessNotes
        });

        return NextResponse.json({
            success: true,
            address: {
                id: customer.address_id,
                service_day: serviceDay,
                trash_day: trashDay,
                gate_code: gateCode,
                hoa_name: hoaName,
                access_notes: accessNotes
            }
        });
    } catch (error) {
        console.error('Reschedule/Update details error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
