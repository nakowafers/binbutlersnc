import { handlers } from "@/auth";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Env } from "@/lib/types";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";

export const runtime = "edge";

async function rateLimitedHandler(
    request: Request,
    handler: (req: Request) => Promise<Response>
): Promise<Response> {
    try {
        const { env } = (getRequestContext() as unknown) as { env: Env };
        const ip = request.headers.get("cf-connecting-ip")
            || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            || "unknown";
        const endpoint = new URL(request.url).pathname;
        const key = getRateLimitKey(ip, endpoint);

        const { allowed, remaining } = await checkRateLimit(env.DB, key);
        if (!allowed) {
            return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
                status: 429,
                headers: {
                    "Content-Type": "application/json",
                    "Retry-After": "60",
                    "X-RateLimit-Remaining": "0",
                },
            });
        }

        const response = await handler(request);
        const headers = new Headers(response.headers);
        headers.set("X-RateLimit-Remaining", String(remaining));
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch {
        // Fail-closed: if rate limiting encounters an error, return 429
        return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
            status: 429,
            headers: {
                "Content-Type": "application/json",
                "Retry-After": "60",
            },
        });
    }
}

export const GET = (request: Request) => rateLimitedHandler(request, handlers.GET as unknown as (req: Request) => Promise<Response>);

export const POST = (request: Request) => rateLimitedHandler(request, handlers.POST as unknown as (req: Request) => Promise<Response>);
