import { NextResponse } from 'next/server';
import { createAdminCustomerService } from '@/lib/admin/createAdminServices';
import type { BinQuantityPreviewBeforeState } from '@/lib/admin/BinQuantityAdjustmentService';
import { authorizeAdmin, getAdminEnv, parseAdjustmentInput, parseRequestBody, InputError, serviceErrorResponse } from '../route-utils';

export const runtime = 'edge';

function parsePreviewBefore(body: Record<string, unknown>): BinQuantityPreviewBeforeState {
    const before = parseRequestBody(body.previewBefore);
    const isCadence = (value: unknown): value is 28 | 56 | 84 => value === 28 || value === 56 || value === 84;
    const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
    if (!isInteger(before.d1Bins) || !isCadence(before.stripeCadenceDays)
        || typeof before.stripeBasePriceId !== 'string' || !isInteger(before.stripeExtraBinQuantity)
        || typeof before.stripeExtraBinPriceId !== 'string'
        || typeof before.stripeExtraBinSubscriptionItemId !== 'string'
        || (before.stripeCustomerBinQuantity !== null && !isInteger(before.stripeCustomerBinQuantity))) {
        throw new InputError('An exact preview before-state is required');
    }
    return {
        d1Bins: before.d1Bins,
        stripeCadenceDays: before.stripeCadenceDays,
        stripeBasePriceId: before.stripeBasePriceId,
        stripeExtraBinQuantity: before.stripeExtraBinQuantity,
        stripeExtraBinPriceId: before.stripeExtraBinPriceId,
        stripeExtraBinSubscriptionItemId: before.stripeExtraBinSubscriptionItemId,
        stripeCustomerBinQuantity: before.stripeCustomerBinQuantity,
    };
}

export async function POST(request: Request) {
    const denied = await authorizeAdmin(request);
    if ('status' in denied) return denied;
    try {
        const body = parseRequestBody(await request.json().catch(() => { throw new InputError('Invalid JSON body'); }));
        const previewBefore = parsePreviewBefore(body);
        const input = {
            ...parseAdjustmentInput(body),
            previewBefore,
        };
        const service = createAdminCustomerService(getAdminEnv(), denied.operatorId);
        return NextResponse.json(await service.confirm(input));
    } catch (error) {
        if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.status });
        return serviceErrorResponse(error, 'Admin bin quantity confirmation error');
    }
}
