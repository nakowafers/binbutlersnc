import { auth } from "@/auth";

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const { nextUrl } = req;

    // Gate admin paths
    if (nextUrl.pathname.startsWith('/admin') || nextUrl.pathname.startsWith('/api/admin')) {
        if (!isLoggedIn) {
            return Response.redirect(new URL("/signin", nextUrl));
        }
        const role = (req.auth?.user as { role?: string })?.role;
        if (role !== 'ADMIN') {
            return Response.redirect(new URL("/portal", nextUrl));
        }
    }

    // Gate portal paths
    if (nextUrl.pathname.startsWith('/portal') || nextUrl.pathname.startsWith('/api/portal')) {
        if (!isLoggedIn) {
            return Response.redirect(new URL("/signin", nextUrl));
        }
    }
});

export const config = {
    matcher: [
        "/portal/:path*",
        "/admin/:path*",
        "/api/portal/:path*",
        "/api/admin/:path*"
    ]
};
