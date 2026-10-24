import "server-only";
import { createHmac } from "node:crypto";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { env, integrations, staff2faRequired } from "@/env";
import { db } from "@/server/db";
import { requestMeta } from "@/server/request";
import { rateLimit } from "@/server/services/ratelimit";
import { safeEqual } from "@/server/crypto";
import { authConfig, STAFF_SESSION_HOURS, STUDENT_SESSION_DAYS, type MfaState } from "./config.edge";
import { burnPasswordCheck, verifyPassword } from "./password";
import { consumeMagicLink, MagicLinkError } from "@/server/services/magic-link";
import { isStaff, normalizeTeamLeadSections } from "./rbac";
import { getSetting } from "@/server/services/settings";
import { sessionVersionValid } from "./sessions";

/** Staff MFA state at sign-in: verify when enrolled, otherwise enrol — or skip entirely when 2FA is optional (D-146). */
function mfaFor(totpEnabled: boolean): MfaState {
  if (totpEnabled) return "verify";
  return staff2faRequired ? "setup" : "ok";
}

/** Lockout after 8 failed attempts in 15 minutes (SPEC §10). */
export const LOCKOUT = { attempts: 8, windowMinutes: 15 } as const;

class AuthError extends CredentialsSignin {
  constructor(code: "invalid" | "locked" | "rate_limited" | "inactive") {
    super();
    this.code = code;
  }
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(256),
});

export async function isLockedOut(email: string) {
  const since = new Date(Date.now() - LOCKOUT.windowMinutes * 60_000);
  const lastSuccess = await db.loginEvent.findFirst({
    where: { email, success: true, at: { gte: since } },
    orderBy: { at: "desc" },
    select: { at: true },
  });
  const failures = await db.loginEvent.count({
    where: { email, success: false, reason: "invalid", at: { gte: lastSuccess?.at ?? since } },
  });
  return failures >= LOCKOUT.attempts;
}

async function logLogin(input: { userId?: string | null; email: string; success: boolean; reason?: string }) {
  const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }));
  await db.loginEvent.create({
    data: {
      userId: input.userId ?? null,
      email: input.email,
      success: input.success,
      reason: input.reason ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    },
  });
}

/** Signed, short-lived proof that the server verified a TOTP code (used with `update()`). */
export function signMfaProof(userId: string) {
  const ts = Date.now();
  const mac = createHmac("sha256", env.AUTH_SECRET).update(`mfa:${userId}:${ts}`).digest("base64url");
  return `${ts}.${mac}`;
}

/**
 * Signed proof that the current device may adopt a new `sessionVersion`
 * (after the user changed their own password): keeps this device signed in
 * while every other JWT is invalidated (D-124).
 */
export function signSessionVersionProof(userId: string, version: number) {
  const ts = Date.now();
  const mac = createHmac("sha256", env.AUTH_SECRET).update(`sv:${userId}:${version}:${ts}`).digest("base64url");
  return `${version}.${ts}.${mac}`;
}

function verifySessionVersionProof(userId: string, proof: unknown): number | null {
  if (typeof proof !== "string") return null;
  const [vRaw, tsRaw, mac] = proof.split(".");
  const version = Number(vRaw);
  const ts = Number(tsRaw);
  if (!Number.isInteger(version) || !ts || !mac || Date.now() - ts > 60_000 || ts > Date.now() + 5_000) return null;
  const expected = createHmac("sha256", env.AUTH_SECRET).update(`sv:${userId}:${version}:${ts}`).digest("base64url");
  return safeEqual(expected, mac) ? version : null;
}

function verifyMfaProof(userId: string, proof: unknown) {
  if (typeof proof !== "string") return false;
  const [tsRaw, mac] = proof.split(".");
  const ts = Number(tsRaw);
  if (!ts || !mac || Date.now() - ts > 60_000 || ts > Date.now() + 5_000) return false;
  const expected = createHmac("sha256", env.AUTH_SECRET).update(`mfa:${userId}:${ts}`).digest("base64url");
  return safeEqual(expected, mac);
}

/** Fresh claims for a user, read from the database. */
async function claimsFor(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      timezone: true,
      totpEnabled: true,
      sessionVersion: true,
      deletedAt: true,
      student: { select: { id: true, onboardingCompletedAt: true } },
    },
  });
  if (!u || u.deletedAt || u.status === "SUSPENDED" || u.status === "DEACTIVATED") return null;
  // A team lead's admin sections are a setting (D-149); carrying them in the JWT lets the edge middleware enforce them.
  const sections = u.role === "TEAM_LEAD" ? normalizeTeamLeadSections((await getSetting("teamLeadAccess")).sections) : undefined;
  return { ...u, sections };
}

const providers = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) throw new AuthError("invalid");
      const { email, password } = parsed.data;
      const meta = await requestMeta().catch(() => ({ ip: null }));

      const rl = await rateLimit("login", `${meta.ip ?? "unknown"}:${email}`);
      if (!rl.success) {
        await logLogin({ email, success: false, reason: "rate_limited" });
        throw new AuthError("rate_limited");
      }
      if (await isLockedOut(email)) {
        await logLogin({ email, success: false, reason: "locked" });
        throw new AuthError("locked");
      }

      const user = await db.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, role: true, status: true, passwordHash: true, deletedAt: true },
      });
      if (!user) {
        await burnPasswordCheck(password);
        await logLogin({ email, success: false, reason: "invalid" });
        throw new AuthError("invalid");
      }
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) {
        await logLogin({ userId: user.id, email, success: false, reason: "invalid" });
        throw new AuthError("invalid");
      }
      if (user.deletedAt || user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
        await logLogin({ userId: user.id, email, success: false, reason: "inactive" });
        throw new AuthError("inactive");
      }

      await logLogin({ userId: user.id, email, success: true });
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), status: user.status === "INVITED" ? "ACTIVE" : undefined },
      });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    },
  }),
  /** Students only: single-use emailed login link (D-111). Staff are refused before any session exists. */
  Credentials({
    id: "magic",
    name: "Magic link",
    credentials: { token: {} },
    async authorize(raw) {
      const token = typeof raw?.token === "string" ? raw.token : "";
      if (!token || token.length > 200) throw new AuthError("invalid");
      const meta = await requestMeta().catch(() => ({ ip: null }));
      const rl = await rateLimit("login", `magic:${meta.ip ?? "unknown"}`);
      if (!rl.success) throw new AuthError("rate_limited");
      try {
        const user = await consumeMagicLink(token);
        await logLogin({ userId: user.id, email: user.email, success: true, reason: "magic" });
        return user;
      } catch (e) {
        if (e instanceof MagicLinkError) {
          await logLogin({ email: "", success: false, reason: `magic_${e.code}` });
          throw new AuthError(e.code === "inactive" ? "inactive" : "invalid");
        }
        throw e;
      }
    },
  }),
  ...(integrations.google ? [Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET })] : []),
];

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  secret: env.AUTH_SECRET,
  providers,
  callbacks: {
    ...authConfig.callbacks,

    /** Google is for students only; staff must use email + password + 2FA. */
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const email = (profile?.email ?? user.email ?? "").toLowerCase();
      if (!email || profile?.email_verified === false) return "/login?error=google_unverified";
      const existing = await db.user.findUnique({ where: { email }, select: { id: true, role: true, status: true } });
      if (existing && isStaff(existing.role)) return "/login?error=staff_use_password";
      if (existing && existing.status !== "ACTIVE" && existing.status !== "INVITED") return "/login?error=inactive";
      const dbUser =
        existing ??
        (await db.user.create({
          data: { email, name: user.name ?? email.split("@")[0]!, role: "STUDENT", emailVerified: new Date() },
          select: { id: true, role: true, status: true },
        }));
      await db.account.upsert({
        where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
        update: {},
        create: {
          userId: dbUser.id,
          provider: "google",
          providerAccountId: account.providerAccountId,
          type: account.type,
          id_token: account.id_token ?? null,
          scope: account.scope ?? null,
        },
      });
      await db.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date(), emailVerified: new Date() } });
      await logLogin({ userId: dbUser.id, email, success: true, reason: "google" });
      user.id = dbUser.id;
      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      // Expire per-role sessions (staff 12h, students 7d).
      if (typeof token.sessionExpiresAt === "number" && Date.now() > token.sessionExpiresAt) return null;

      if (user && account) {
        let userId = user.id!;
        if (account.provider === "google") {
          const byEmail = await db.user.findUnique({ where: { email: (user.email ?? "").toLowerCase() }, select: { id: true } });
          if (!byEmail) return null;
          userId = byEmail.id;
        }
        const c = await claimsFor(userId);
        if (!c) return null;
        const staff = isStaff(c.role);
        token.uid = c.id;
        token.role = c.role;
        token.name = c.name;
        token.email = c.email;
        token.timezone = c.timezone;
        token.mfa = (staff ? mfaFor(c.totpEnabled) : "none") satisfies MfaState;
        token.needsProfile = c.role === "STUDENT" && !c.student;
        token.onboarded = Boolean(c.student?.onboardingCompletedAt);
        token.sessionExpiresAt = Date.now() + (staff ? STAFF_SESSION_HOURS * 3600e3 : STUDENT_SESSION_DAYS * 86400e3);
        token.sv = c.sessionVersion;
        token.sections = c.sections;
        token.checkedAt = Date.now();
        return token;
      }

      const uid = typeof token.uid === "string" ? token.uid : null;
      if (!uid) return token;

      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      const stale = Date.now() - checkedAt > 5 * 60_000;
      if (trigger === "update" || stale) {
        const c = await claimsFor(uid);
        if (!c) return null;
        // "Log out everywhere" (D-124): the device that just bumped the version may adopt it with a signed proof.
        const adopted = trigger === "update" && session ? verifySessionVersionProof(uid, (session as { svProof?: unknown }).svProof) : null;
        if (adopted !== null && adopted === c.sessionVersion) token.sv = adopted;
        if (!sessionVersionValid(token.sv, c.sessionVersion)) return null;
        token.role = c.role;
        token.name = c.name;
        token.timezone = c.timezone;
        token.needsProfile = c.role === "STUDENT" && !c.student;
        token.onboarded = Boolean(c.student?.onboardingCompletedAt);
        token.sections = c.sections;
        token.checkedAt = Date.now();
        if (isStaff(c.role) && token.mfa !== "ok") token.mfa = mfaFor(c.totpEnabled);
        if (trigger === "update" && session && verifyMfaProof(uid, (session as { mfaProof?: unknown }).mfaProof)) {
          token.mfa = "ok";
        }
      }
      return token;
    },
  },
});
