export function validateOrigin(request: Request): boolean {
    const origin = request.headers.get('Origin');
    const referer = request.headers.get('Referer');
    const host = request.headers.get('Host') || new URL(request.url).host;

    const check = (url: string): boolean => {
        try {
            const parsed = new URL(url);
            return parsed.host === host;
        } catch {
            return false;
        }
    };

    if (origin) return check(origin);
    if (referer) return check(referer);

    return false;
}
