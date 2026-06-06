import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { D1Adapter } from "@auth/d1-adapter";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Env } from "./lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createD1AdapterWithRetry(db: D1Database): any {
  const base = D1Adapter(db);
  return {
    ...base,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async createUser(user: any) {
      try {
        return await base.createUser!(user);
      } catch {
        const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(user.email).first();
        if (existing) return existing;
        throw new Error('Failed to create user and no existing user found');
      }
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const { env } = (getRequestContext() as unknown) as { env: Env };

  return {
    trustHost: true,
    secret: env.AUTH_SECRET,
    adapter: createD1AdapterWithRetry(env.DB),
    providers: [
      Resend({
        apiKey: env.RESEND_API_KEY,
        from: "onboarding@resend.dev", // Default for testing
        sendVerificationRequest: async (params) => {
          const { identifier, url, provider } = params;
          
          // Since npm run preview does a production build, NODE_ENV is 'production'.
          // We bypass Resend if the API key is missing or is just a placeholder (starts with "re_...")
          if (!provider.apiKey || provider.apiKey === "re_..." || provider.apiKey.includes("...")) {
            console.log("====================================================");
            console.log("MAGIC LINK GENERATED (Fake API Key Mode):");
            console.log(`Login for ${identifier}: \n${url}`);
            console.log("====================================================");
            return;
          }

          // Otherwise, proceed with normal Resend email logic
          try {
            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${provider.apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: provider.from,
                to: identifier,
                subject: "Sign in to Bin Butlers NC",
                html: `<p>Click here to log in: <a href="${url}">${url}</a></p>`,
              }),
            });

            if (!response.ok) {
              const error = await response.json();
              throw new Error(`Resend error: ${JSON.stringify(error)}`);
            }
          } catch (error) {
            console.error("Failed to send verification email:", error);
            throw error;
          }
        },
      }),
    ],
    callbacks: {
      authorized({ request, auth: session }) {
        const isLoggedIn = !!session?.user;
        const { nextUrl } = request;

        if (nextUrl.pathname.startsWith('/admin') || nextUrl.pathname.startsWith('/api/admin')) {
          if (!isLoggedIn) return false;
          const role = (session?.user as { role?: string })?.role;
          if (role !== 'ADMIN') return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      },
      async session({ session, user }) {
        if (session.user) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sessionUser = session.user as any;
          sessionUser.id = user.id;
          sessionUser.role = 'CUSTOMER';
          const rep = await env.DB.prepare(
            'SELECT is_admin FROM sales_reps WHERE LOWER(email) = LOWER(?)'
          ).bind(user.email as string).first<{ is_admin: number }>();
          if (rep?.is_admin) sessionUser.role = 'ADMIN';
        }
        return session;
      },
    },
    pages: {
      signIn: "/signin",
      verifyRequest: "/verify-request",
    },
  };
});
