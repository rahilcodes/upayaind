import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { passwordStrength } from "@/server/auth/strength";
import { newTotpSecret, totpQrDataUrl, verifyTotp } from "@/server/auth/totp";
import { open as openSecret } from "@/server/crypto";
import { CONSENT_VERSION } from "@/lib/schemas/auth";
import { absoluteUrl } from "@/lib/utils";
import { consumeToken, issueToken } from "./auth-tokens";
import { sendEmail } from "./email";
import { audit } from "./audit";
import { trackEvent } from "./events";
import { attributeReferral } from "./referrals";

export class AccountError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "AccountError";
  }
}

function safeTimezone(tz: string | undefined, fallback: string) {
  if (!tz) return fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return fallback;
  }
}

export async function checkPasswordPolicy(password: string, inputs: string[]) {
  const s = passwordStrength(password, inputs);
  if (s.score < 2) {
    throw new AccountError(s.warning || "This password is too easy to guess. Try a longer phrase.", "password");
  }
}

/** F1 step 1: create a student account (unverified) with consents. */
export async function registerStudent(input: {
  name: string;
  email: string;
  password: string;
  phone: string;
  marketCode: string;
  timezone?: string;
  /** Referral code from ?ref= or the `ref` cookie (D-113). */
  ref?: string | null;
}) {
  const market = await db.market.findFirst({
    where: { code: input.marketCode, isActive: true },
    select: { id: true, defaultTimezone: true },
  });
  if (!market) throw new AccountError("We don't serve this country yet.", "market");
  await checkPasswordPolicy(input.password, [input.name, input.email]);

  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AccountError("An account with this email already exists. Log in instead.", "email");

  const now = new Date();
  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
      role: "STUDENT",
      timezone: safeTimezone(input.timezone, market.defaultTimezone),
      student: {
        create: {
          marketId: market.id,
          consentTermsAt: now,
          consentApplyOnBehalfAt: now,
          consentAgreementAt: now,
          consentVersion: CONSENT_VERSION,
        },
      },
    },
    select: { id: true, email: true, name: true, student: { select: { id: true } } },
  });
  if (input.ref && user.student) await attributeReferral(user.student.id, input.ref).catch((e) => console.error("[referrals] attribution failed", e));
  await sendVerificationEmail(user.id);
  await trackEvent("signup_completed", user.id, { method: "password", market: input.marketCode });
  return { id: user.id, email: user.email, name: user.name };
}

/** After Google sign-up: collect phone, market and consents (SPEC F1). */
export async function completeStudentProfile(userId: string, input: { phone: string; marketCode: string; timezone?: string; ref?: string | null }) {
  const market = await db.market.findFirst({
    where: { code: input.marketCode, isActive: true },
    select: { id: true, defaultTimezone: true },
  });
  if (!market) throw new AccountError("We don't serve this country yet.", "market");
  const now = new Date();
  await db.user.update({
    where: { id: userId },
    data: {
      phone: input.phone,
      timezone: safeTimezone(input.timezone, market.defaultTimezone),
      student: {
        upsert: {
          create: { marketId: market.id, consentTermsAt: now, consentApplyOnBehalfAt: now, consentAgreementAt: now, consentVersion: CONSENT_VERSION },
          update: { marketId: market.id, consentTermsAt: now, consentApplyOnBehalfAt: now, consentAgreementAt: now, consentVersion: CONSENT_VERSION },
        },
      },
    },
  });
  if (input.ref) {
    const sp = await db.studentProfile.findUnique({ where: { userId }, select: { id: true } });
    if (sp) await attributeReferral(sp.id, input.ref).catch((e) => console.error("[referrals] attribution failed", e));
  }
  await trackEvent("signup_completed", userId, { method: "google", market: input.marketCode });
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailVerified: true } });
  if (!user || user.emailVerified) return;
  const token = await issueToken(userId, "VERIFY_EMAIL");
  await sendEmail({
    to: user.email,
    subject: "Confirm your email for UpayaInd",
    content: {
      preview: "Confirm your email to finish setting up your account",
      heading: `Welcome, ${user.name.split(" ")[0]}!`,
      paragraphs: [
        "Please confirm your email address so we can keep you updated on every application we send for you.",
        "This link is valid for 24 hours.",
      ],
      cta: { label: "Confirm email", href: absoluteUrl(`/verify-email?token=${token}`) },
      footnote: "If you didn't sign up for UpayaInd, you can safely ignore this email.",
    },
  });
}

export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, "VERIFY_EMAIL");
  if (!userId) return null;
  await db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  return userId;
}

/** Always succeeds from the caller's view (no account enumeration). */
export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, status: true, deletedAt: true } });
  if (!user || user.deletedAt || user.status === "DEACTIVATED") return;
  const token = await issueToken(user.id, "RESET_PASSWORD");
  await sendEmail({
    to: email,
    subject: "Reset your UpayaInd password",
    content: {
      preview: "Reset your password",
      heading: "Reset your password",
      paragraphs: ["We received a request to reset your password. The link below is valid for 30 minutes and can be used once."],
      cta: { label: "Choose a new password", href: absoluteUrl(`/reset-password?token=${token}`) },
      footnote: "If you didn't ask for this, you can ignore this email. Your password won't change.",
    },
  });
}

export async function resetPassword(token: string, password: string) {
  const userId = await consumeToken(token, "RESET_PASSWORD");
  if (!userId) throw new AccountError("This link has expired or was already used. Request a new one.", "token");
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) throw new AccountError("Account not found.");
  await checkPasswordPolicy(password, [user.email, user.name]);
  await db.user.update({
    where: { id: userId },
    // A reset also signs out every other device (D-124).
    data: { passwordHash: await hashPassword(password), emailVerified: new Date(), status: undefined, sessionVersion: { increment: 1 } },
  });
  await audit({ actorId: userId, action: "user.password_reset", entity: "User", entityId: userId });
  return userId;
}

/** Accept a staff invite: set password (2FA setup follows at first login). */
export async function acceptInvite(token: string, password: string) {
  const userId = await consumeToken(token, "INVITE");
  if (!userId) throw new AccountError("This invite has expired or was already used. Ask your admin for a new one.", "token");
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) throw new AccountError("Account not found.");
  await checkPasswordPolicy(password, [user.email, user.name]);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), emailVerified: new Date(), status: "ACTIVE" },
  });
  return user;
}

/** Start (or restart) TOTP enrolment: store a new sealed secret, not yet enabled. */
export async function beginTotpSetup(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, totpEnabled: true, totpSecretEnc: true } });
  if (!user) throw new AccountError("Account not found.");
  if (user.totpEnabled) throw new AccountError("Two-step verification is already set up.");
  // Reuse a pending (not yet confirmed) secret so a page refresh doesn't invalidate a scanned QR code.
  let secret: string;
  if (user.totpSecretEnc) {
    secret = openSecret(user.totpSecretEnc);
  } else {
    const fresh = newTotpSecret();
    secret = fresh.secret;
    await db.user.update({ where: { id: userId }, data: { totpSecretEnc: fresh.sealed } });
  }
  const qr = await totpQrDataUrl(user.email, secret);
  return { secret, ...qr };
}

/** Verify a TOTP code; enables 2FA on first success and returns fresh backup codes then (D-123). */
export async function checkTotp(userId: string, code: string): Promise<{ backupCodes: string[] | null }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabled: true } });
  if (!user?.totpSecretEnc) throw new AccountError("Set up your authenticator app first.", "code");
  if (!verifyTotp(user.totpSecretEnc, code)) throw new AccountError("That code didn't work. Check your app and try again.", "code");
  if (!user.totpEnabled) {
    const codes = newBackupCodes();
    await db.user.update({ where: { id: userId }, data: { totpEnabled: true, totpBackupCodes: codes.map(hashBackupCode) } });
    await audit({ actorId: userId, action: "user.2fa_enabled", entity: "User", entityId: userId });
    return { backupCodes: codes };
  }
  return { backupCodes: null };
}

// ─────────────────────────── 2FA backup codes (D-123) ───────────────────────────

export const BACKUP_CODE_COUNT = 8;

/** `xxxx-xxxx` from a 32-symbol alphabet without look-alikes (0/O, 1/I/L). */
export function newBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]!);
    return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
  });
}

export function normalizeBackupCode(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashBackupCode(code: string) {
  return createHash("sha256").update(`backup:${normalizeBackupCode(code)}`).digest("hex");
}

/**
 * Consume one backup code (single use). The conditional `updateMany` makes two
 * concurrent attempts with the same code race safely: only one row update
 * still matches `has` after the first commits.
 */
export async function consumeBackupCode(userId: string, raw: string): Promise<boolean> {
  const clean = normalizeBackupCode(raw);
  if (clean.length !== 8) return false;
  const hash = hashBackupCode(clean);
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpEnabled: true, totpBackupCodes: true } });
  if (!user?.totpEnabled || !user.totpBackupCodes.includes(hash)) return false;
  const r = await db.user.updateMany({ where: { id: userId, totpBackupCodes: { has: hash } }, data: { totpBackupCodes: user.totpBackupCodes.filter((h) => h !== hash) } });
  if (r.count !== 1) return false;
  await audit({ actorId: userId, action: "user.2fa_backup_used", entity: "User", entityId: userId, after: { remaining: user.totpBackupCodes.length - 1 } });
  return true;
}

export async function backupCodesRemaining(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { totpBackupCodes: true } });
  return u?.totpBackupCodes.length ?? 0;
}

/** Replace every backup code after confirming the account password. */
export async function regenerateBackupCodes(userId: string, password: string): Promise<string[]> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, totpEnabled: true } });
  if (!u) throw new AccountError("Account not found.");
  if (!u.totpEnabled) throw new AccountError("Set up two-step verification first.");
  if (!(await verifyPassword(u.passwordHash, password))) throw new AccountError("Your password is incorrect.", "password");
  const codes = newBackupCodes();
  await db.user.update({ where: { id: userId }, data: { totpBackupCodes: codes.map(hashBackupCode) } });
  await audit({ actorId: userId, action: "user.2fa_backup_regenerated", entity: "User", entityId: userId });
  return codes;
}

// ─────────────────────────── Sessions (D-124) ───────────────────────────

/** Invalidate every JWT for this user; returns the new version (the caller may adopt it on the current device). */
export async function bumpSessionVersion(userId: string, actorId: string | null = userId, reason = "logout_all") {
  const u = await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
  await audit({ actorId, action: "user.sessions_revoked", entity: "User", entityId: userId, after: { reason, sessionVersion: u.sessionVersion } });
  return u.sessionVersion;
}

/** ADMIN: clear a staff member's authenticator + backup codes; their next login runs 2FA setup again (D-123). */
export async function adminResetTwoFactor(actor: { id: string; role: string }, employeeId: string) {
  if (actor.role !== "ADMIN") throw new AccountError("Only an admin can reset two-step verification.");
  const e = await db.employeeProfile.findUnique({ where: { id: employeeId }, select: { userId: true, user: { select: { id: true, email: true, name: true, totpEnabled: true, deletedAt: true } } } });
  if (!e || e.user.deletedAt) throw new AccountError("Employee not found.");
  if (e.userId === actor.id) throw new AccountError("Reset your own authenticator from your profile instead.");
  await db.user.update({ where: { id: e.userId }, data: { totpSecretEnc: null, totpEnabled: false, totpBackupCodes: [], sessionVersion: { increment: 1 } } });
  await audit({ actorId: actor.id, action: "user.2fa_reset", entity: "User", entityId: e.userId, before: { totpEnabled: e.user.totpEnabled }, after: { totpEnabled: false, sessionsRevoked: true } });
  await sendEmail({
    to: e.user.email,
    subject: "Your UpayaInd two-step verification was reset",
    content: {
      preview: "Set up your authenticator app again at your next sign-in",
      heading: `Hi ${e.user.name.split(" ")[0]},`,
      paragraphs: [
        "An administrator reset the two-step verification on your UpayaInd account and signed you out of every device.",
        "At your next sign-in you'll be asked to scan a new QR code with your authenticator app and you'll receive new backup codes.",
      ],
      cta: { label: "Sign in", href: absoluteUrl("/login") },
      footnote: "If you didn't expect this, contact your manager right away.",
    },
  }).catch((err) => console.error("[accounts] 2FA reset email failed", err));
  return { userId: e.userId };
}
