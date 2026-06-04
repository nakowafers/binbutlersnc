import { auth } from "@/auth";

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const { nextUrl } = req;

    // Gate admin paths
    if (nextUrl.pathname.startsWith('/admin') || nextUrl.pathname.startsWith('/api/admin')) {
        if (!isLoggedIn) {
            const signinUrl = new URL("/signin", nextUrl);
            signinUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
            return Response.redirect(signinUrl);
        }
        const role = (req.auth?.user as { role?: string })?.role;
        if (role !== 'ADMIN') {
            return Response.redirect(new URL("/", nextUrl));
        }
    }

});

export const config = {
    matcher: [
        "/admin/:path*",
        "/api/admin/:path*"
    ]
};
