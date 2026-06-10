import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Env } from "./lib/types";
import { createAuthUsersAdapter } from "./lib/auth/custom-adapter";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const { env } = (getRequestContext() as unknown) as { env: Env };

  return {
    trustHost: true,
    secret: env.AUTH_SECRET,
    adapter: createAuthUsersAdapter(env.DB),
    session: { strategy: 'jwt' },
    providers: [
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        allowDangerousEmailAccountLinking: true,
      }),
      Resend({
        apiKey: env.RESEND_API_KEY,
        from: "onboarding@resend.dev",
        sendVerificationRequest: async (params) => {
          const { identifier, url, provider } = params;

          if (!provider.apiKey || provider.apiKey === "re_..." || provider.apiKey.includes("...")) {
            console.log("====================================================");
            console.log("MAGIC LINK GENERATED (Fake API Key Mode):");
            console.log(`Login for ${identifier}: \n${url}`);
            console.log("====================================================");
            return;
          }

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
      async jwt({ token, user }) {
        if (user) {
          token.id = user.id;
          try {
            const rep = await env.DB.prepare(
              'SELECT is_admin FROM sales_reps WHERE LOWER(email) = LOWER(?)'
            ).bind(user.email as string).first<{ is_admin: number }>();
            token.role = rep?.is_admin ? 'ADMIN' : 'CUSTOMER';
          } catch (e) {
            console.error('jwt callback: failed to query sales_reps', e);
            token.role = 'CUSTOMER';
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          const sessionUser = session.user as unknown as Record<string, unknown>;
          sessionUser.id = token.id as string;
          sessionUser.role = token.role as string;
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
