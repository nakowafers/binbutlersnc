import { getRequestContext } from '@cloudflare/next-on-pages';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { validateOrigin } from '@/lib/csrf';
import type { Env } from '@/lib/types';
type BinQuantityServiceError = { status?: number; code?: string; message?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isServiceError(value: unknown): value is BinQuantityServiceError {
    return isRecord(value)
        && (value.status === undefined || typeof value.status === 'number')
        && (value.code === undefined || typeof value.code === 'string')
        && (value.message === undefined || typeof value.message === 'string');
}

function isAdminUser(value: unknown): value is { role: 'ADMIN'; id?: string; email?: string } {
    if (!isRecord(value) || value.role !== 'ADMIN') return false;
    return (value.id === undefined || typeof value.id === 'string')
        && (value.email === undefined || typeof value.email === 'string');
}

export function getAdminEnv(): Env {
    const environment = getRequestContext().env;
    if (!isEnv(environment)) {
        throw new Error('Cloudflare environment is unavailable');
    }
    return environment;
}

function isEnv(value: unknown): value is Env {
    return isRecord(value) && 'DB' in value;
}

function isInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value);
}

export async function authorizeAdmin(request: Request): Promise<NextResponse | { operatorId: string }> {
    if (!validateOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const session = await auth();
    if (!session || !isAdminUser(session.user)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user;
    if (!user.id && !user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return { operatorId: user.id || user.email! };
}

export function serviceErrorResponse(error: unknown, label: string): NextResponse {
    const serviceError = isServiceError(error) ? error : undefined;
    const status = typeof serviceError?.status === 'number' ? serviceError.status : 500;
    if (status >= 400 && status < 600 && serviceError?.message) {
        return NextResponse.json({ error: serviceError.message, ...(serviceError.code ? { code: serviceError.code } : {}) }, { status });
    }
    console.error(`${label}:`, error);
    return NextResponse.json({ error: 'Unable to complete bin quantity adjustment' }, { status: 500 });
}

export function parseAdjustmentInput(body: unknown) {
    if (!isRecord(body)) throw new InputError('Request body must be an object');
    const input = body;
    if (typeof input.customerId !== 'string' || !input.customerId.trim()) throw new InputError('customerId is required');
    if (!isInteger(input.targetBins)) throw new InputError('targetBins must be an integer');
    if (typeof input.reason !== 'string' || !input.reason.trim()) throw new InputError('A reason is required');
    if (typeof input.correlationKey !== 'string' || !input.correlationKey.trim()) throw new InputError('correlationKey is required');
    return {
        customerId: input.customerId,
        targetBins: input.targetBins,
        reason: input.reason.trim(),
        correlationKey: input.correlationKey.trim(),
    };
}

export function parseRequestBody(body: unknown): Record<string, unknown> {
    if (!isRecord(body)) throw new InputError('Request body must be an object');
    return body;
}

export class InputError extends Error {
    readonly status = 400;
}
