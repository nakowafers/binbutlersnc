export interface RateLimitConfig {
    maxRequests: number;
    windowSeconds: number;
}

const AUTH_RATE_LIMIT: RateLimitConfig = {
    maxRequests: 10,
    windowSeconds: 60,
};

export function getRateLimitKey(ip: string, endpoint: string): string {
    return `ratelimit:${ip}:${endpoint}`;
}

export async function checkRateLimit(
    db: D1Database,
    key: string,
    config: RateLimitConfig = AUTH_RATE_LIMIT
): Promise<{ allowed: boolean; remaining: number }> {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - config.windowSeconds;

    const row = await db.prepare(
        'SELECT count, window_start FROM rate_limits WHERE key = ?'
    ).bind(key).first<{ count: number; window_start: number }>();

    if (!row) {
        await db.prepare(
            'INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)'
        ).bind(key, now).run();
        return { allowed: true, remaining: config.maxRequests - 1 };
    }

    if (row.window_start < windowStart) {
        await db.prepare(
            'UPDATE rate_limits SET count = 1, window_start = ?, updated_at = ? WHERE key = ?'
        ).bind(now, now, key).run();
        return { allowed: true, remaining: config.maxRequests - 1 };
    }

    if (row.count >= config.maxRequests) {
        return { allowed: false, remaining: 0 };
    }

    await db.prepare(
        'UPDATE rate_limits SET count = count + 1, updated_at = ? WHERE key = ?'
    ).bind(now, key).run();
    return { allowed: true, remaining: config.maxRequests - row.count - 1 };
}

export async function resetRateLimit(db: D1Database, key: string): Promise<void> {
    await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
}
