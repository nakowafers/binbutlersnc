import { NextResponse } from 'next/server';
import { createAdminCustomerService } from '@/lib/admin/createAdminServices';
import { authorizeAdmin, getAdminEnv, parseAdjustmentInput, InputError, serviceErrorResponse } from '../route-utils';

export const runtime = 'edge';

export async function POST(request: Request) {
    const denied = await authorizeAdmin(request);
    if ('status' in denied) return denied;
    try {
        const input = parseAdjustmentInput(await request.json().catch(() => { throw new InputError('Invalid JSON body'); }));
        const service = createAdminCustomerService(getAdminEnv(), denied.operatorId);
        const preview = await service.preview(input);
        return NextResponse.json({
            customerId: preview.customerId,
            targetBins: preview.targetBins,
            before: {
                d1Bins: preview.before.d1Bins,
                stripeCadenceDays: preview.before.stripeCadenceDays,
                stripeBasePriceId: preview.before.stripeBasePriceId,
                stripeExtraBinQuantity: preview.before.stripeExtraBinQuantity,
                stripeExtraBinPriceId: preview.before.stripeExtraBinPriceId,
                stripeExtraBinSubscriptionItemId: preview.before.stripeExtraBinSubscriptionItemId,
                stripeCustomerBinQuantity: preview.before.stripeCustomerBinQuantity,
            },
            mismatch: preview.mismatch,
            requiresNoProration: true,
        });
    } catch (error) {
        if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.status });
        return serviceErrorResponse(error, 'Admin bin quantity preview error');
    }
}
