import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";
import type { MfaState } from "@/server/auth/config.edge";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      name: string;
      email: string;
      mfa: MfaState;
      needsProfile: boolean;
      onboarded: boolean;
      timezone: string;
      /** TEAM_LEAD only: admin sections the admin has enabled (D-149). */
      sections?: string[];
    } & Omit<DefaultSession["user"], "id" | "name" | "email">;
  }
  interface User {
    role?: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
    mfa?: MfaState;
    needsProfile?: boolean;
    onboarded?: boolean;
    timezone?: string;
    sessionExpiresAt?: number;
    checkedAt?: number;
    /** User.sessionVersion at sign-in ("log out everywhere", D-124). */
    sv?: number;
    /** TEAM_LEAD only: granted admin sections, refreshed with the other claims (D-149). */
    sections?: string[];
  }
}
