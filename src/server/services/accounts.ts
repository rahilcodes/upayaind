import "server-only";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { passwordStrength } from "@/server/auth/strength";
import { newTotpSecret, totpQrDataUrl, verifyTotp } from "@/server/auth/totp";
import { open as openSecret } from "@/server/crypto";
import { CONSENT_VERSION } from "@/lib/schemas/auth";
import { absoluteUrl } from "@/lib/utils";
import { consumeToken, issueToken } from "./auth-tokens";
import { sendEmail } from "./email";
import { audit } from "./audit";
import { trackEvent } from "./events";

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
          consentVersion: CONSENT_VERSION,
        },
      },
    },
    select: { id: true, email: true, name: true },
  });
  await sendVerificationEmail(user.id);
  await trackEvent("signup_completed", user.id, { method: "password", market: input.marketCode });
  return user;
}

/** After Google sign-up: collect phone, market and consents (SPEC F1). */
export async function completeStudentProfile(userId: string, input: { phone: string; marketCode: string; timezone?: string }) {
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
          create: { marketId: market.id, consentTermsAt: now, consentApplyOnBehalfAt: now, consentVersion: CONSENT_VERSION },
          update: { marketId: market.id, consentTermsAt: now, consentApplyOnBehalfAt: now, consentVersion: CONSENT_VERSION },
        },
      },
    },
  });
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
    data: { passwordHash: await hashPassword(password), emailVerified: new Date(), status: undefined },
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

/** Verify a TOTP code; enables 2FA on first success. */
export async function checkTotp(userId: string, code: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { totpSecretEnc: true, totpEnabled: true } });
  if (!user?.totpSecretEnc) throw new AccountError("Set up your authenticator app first.", "code");
  if (!verifyTotp(user.totpSecretEnc, code)) throw new AccountError("That code didn't work. Check your app and try again.", "code");
  if (!user.totpEnabled) {
    await db.user.update({ where: { id: userId }, data: { totpEnabled: true } });
    await audit({ actorId: userId, action: "user.2fa_enabled", entity: "User", entityId: userId });
  }
  return true;
}
