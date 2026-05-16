import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { D1Adapter } from "@auth/d1-adapter";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { Env } from "./lib/types";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const { env } = (getRequestContext() as unknown) as { env: Env };

  return {
    adapter: D1Adapter(env.DB),
    providers: [
      Resend({
        apiKey: env.RESEND_API_KEY,
        from: "onboarding@resend.dev", // Default for testing
      }),
    ],
    callbacks: {
      async session({ session, user }) {
        if (session.user) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (session.user as any).id = user.id;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (session.user as any).role = (user as any).role;
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
