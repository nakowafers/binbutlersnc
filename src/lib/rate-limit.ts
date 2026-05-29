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

    // Atomic upsert: create or update the rate limit entry in a single statement.
    // The ON CONFLICT clause handles both new keys and existing keys atomically.
    // If the window has expired, reset count to 1; otherwise increment.
    await db.prepare(
        `INSERT INTO rate_limits (key, count, window_start, updated_at)
         VALUES (?, 1, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN window_start < ? THEN 1 ELSE count + 1 END,
           window_start = CASE WHEN window_start < ? THEN ? ELSE window_start END,
           updated_at = ?`
    ).bind(key, now, now, windowStart, windowStart, now, now).run();

    const row = await db.prepare(
        'SELECT count, window_start FROM rate_limits WHERE key = ?'
    ).bind(key).first<{ count: number; window_start: number }>();

    if (!row) {
        return { allowed: true, remaining: config.maxRequests - 1 };
    }

    return {
        allowed: row.count <= config.maxRequests,
        remaining: Math.max(0, config.maxRequests - row.count)
    };
}

export async function resetRateLimit(db: D1Database, key: string): Promise<void> {
    await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
}
