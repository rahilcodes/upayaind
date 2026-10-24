import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

/**
 * Edge-safe Auth.js configuration shared by middleware and the full server
 * config. It must not import Prisma or Node-only modules.
 */

export type MfaState = "ok" | "setup" | "verify" | "none";

export const STAFF_SESSION_HOURS = 12;
export const STUDENT_SESSION_DAYS = 7;

export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: STUDENT_SESSION_DAYS * 24 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token }) {
      if (typeof token.sessionExpiresAt === "number" && Date.now() > token.sessionExpiresAt) return null;
      return token;
    },
    session({ session, token }) {
      if (token.uid) {
        session.user = {
          ...session.user,
          id: token.uid as string,
          role: token.role as Role,
          name: (token.name as string) ?? "",
          email: (token.email as string) ?? "",
          mfa: (token.mfa as MfaState) ?? "none",
          needsProfile: Boolean(token.needsProfile),
          onboarded: Boolean(token.onboarded),
          timezone: (token.timezone as string) ?? "UTC",
          sections: Array.isArray(token.sections) ? (token.sections as string[]) : undefined,
        };
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
