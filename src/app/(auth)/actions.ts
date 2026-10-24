"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { auth, signIn, signOut, signMfaProof, unstable_update } from "@/server/auth";
import { portalForRole, isStaff } from "@/server/auth/rbac";
import { requestMeta } from "@/server/request";
import { enforceRateLimit, RateLimitError } from "@/server/services/ratelimit";
import {
  AccountError,
  acceptInvite,
  checkTotp,
  consumeBackupCode,
  completeStudentProfile,
  registerStudent,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} from "@/server/services/accounts";
import { requestMagicLink } from "@/server/services/magic-link";
import {
  completeProfileSchema,
  forgotSchema,
  magicLinkSchema,
  loginSchema,
  phoneSchema,
  resetSchema,
  signupSchema,
  totpSchema,
  backupCodeSchema,
} from "@/lib/schemas/auth";
import { db } from "@/server/db";
import { REFERRAL_COOKIE } from "@/server/services/referrals";
import { cookies } from "next/headers";

export type FormState = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
  message?: string;
};

function safeNext(next: string | undefined | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : null;
}

function valuesOf(fd: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? "")]));
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  const values = valuesOf(fd, ["email"]);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  try {
    await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code ?? "generic";
      return { errorCode: ["invalid", "locked", "rate_limited", "inactive"].includes(code) ? code : "generic", values };
    }
    throw e;
  }
  // The new session cookie is on the response, not this request, so read the role from the DB.
  const role = (await db.user.findUnique({ where: { email: parsed.data.email }, select: { role: true } }))?.role;
  if (!role) return { errorCode: "generic", values };
  if (isStaff(role)) redirect("/2fa");
  redirect(safeNext(parsed.data.next) ?? portalForRole(role));
}

/** Students: "Email me a login link". Always reports success (no account enumeration). */
export async function magicLinkRequestAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = magicLinkSchema.safeParse(Object.fromEntries(fd));
  const values = valuesOf(fd, ["email"]);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const meta = await requestMeta();
  try {
    await enforceRateLimit("passwordReset", `magic:${meta.ip ?? "unknown"}:${parsed.data.email}`);
    await requestMagicLink(parsed.data.email, safeNext(parsed.data.next));
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message, values };
    throw e;
  }
  return { ok: true, values };
}

/** Consume a magic link (POST from the /login/magic page so email scanners can't burn it). */
export async function magicLinkLoginAction(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") ?? "");
  const next = safeNext(String(fd.get("next") ?? ""));
  try {
    await signIn("magic", { token, redirect: false });
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code ?? "generic";
      return { errorCode: ["invalid", "rate_limited", "inactive"].includes(code) ? code : "generic" };
    }
    throw e;
  }
  redirect(next ?? "/app");
}

export async function googleSignInAction(fd: FormData) {
  const plan = String(fd.get("plan") ?? "");
  const next = safeNext(String(fd.get("next") ?? "")) ?? (plan ? `/app/checkout?plan=${encodeURIComponent(plan)}` : "/app");
  await signIn("google", { redirectTo: next });
}

export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const values = valuesOf(fd, ["name", "email", "phone", "market", "plan", "consentTerms", "consentApply", "consentAgreement"]);
  const parsed = signupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const phone = phoneSchema(parsed.data.market).safeParse(parsed.data.phone);
  if (!phone.success) return { fieldErrors: { phone: [phone.error.issues[0]!.message] }, values };

  const meta = await requestMeta();
  try {
    await enforceRateLimit("signup", meta.ip ?? "unknown");
    await registerStudent({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      phone: phone.data,
      marketCode: parsed.data.market,
      timezone: parsed.data.timezone,
      ref: parsed.data.ref || (await cookies()).get(REFERRAL_COOKIE)?.value || null,
    });
  } catch (e) {
    if (e instanceof AccountError) return e.field ? { fieldErrors: { [e.field]: [e.message] }, values } : { error: e.message, values };
    if (e instanceof RateLimitError) return { error: e.message, values };
    throw e;
  }
  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirect: false });
  // No login wall before choosing a plan: go straight to checkout if one was picked (SPEC §6.3).
  redirect(parsed.data.plan ? `/app/checkout?plan=${encodeURIComponent(parsed.data.plan)}` : "/pricing?welcome=1");
}

export async function completeProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const values = valuesOf(fd, ["phone", "market", "plan", "consentTerms", "consentApply", "consentAgreement"]);
  const parsed = completeProfileSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const phone = phoneSchema(parsed.data.market).safeParse(parsed.data.phone);
  if (!phone.success) return { fieldErrors: { phone: [phone.error.issues[0]!.message] }, values };
  try {
    await completeStudentProfile(session.user.id, {
      phone: phone.data,
      marketCode: parsed.data.market,
      timezone: parsed.data.timezone,
      ref: parsed.data.ref || (await cookies()).get(REFERRAL_COOKIE)?.value || null,
    });
  } catch (e) {
    if (e instanceof AccountError) return e.field ? { fieldErrors: { [e.field]: [e.message] }, values } : { error: e.message, values };
    throw e;
  }
  await unstable_update({});
  redirect(parsed.data.plan ? `/app/checkout?plan=${encodeURIComponent(parsed.data.plan)}` : "/pricing?welcome=1");
}

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: valuesOf(fd, ["email"]) };
  const meta = await requestMeta();
  try {
    await enforceRateLimit("passwordReset", `${meta.ip ?? "unknown"}:${parsed.data.email}`);
    await requestPasswordReset(parsed.data.email);
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message };
    throw e;
  }
  return { ok: true };
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await resetPassword(parsed.data.token, parsed.data.password);
  } catch (e) {
    if (e instanceof AccountError) return e.field === "password" ? { fieldErrors: { password: [e.message] } } : { error: e.message };
    throw e;
  }
  return { ok: true };
}

export async function acceptInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let email: string;
  let role: Role;
  try {
    ({ email, role } = await acceptInvite(parsed.data.token, parsed.data.password));
  } catch (e) {
    if (e instanceof AccountError) return e.field === "password" ? { fieldErrors: { password: [e.message] } } : { error: e.message };
    throw e;
  }
  await signIn("credentials", { email, password: parsed.data.password, redirect: false });
  // Staff set up 2FA next; a student created by the team (D-147) goes straight to onboarding.
  redirect(isStaff(role) ? "/2fa" : "/app/onboarding");
}

export type TotpState = FormState & { backupCodes?: string[]; next?: string };

export async function verifyTotpAction(_: TotpState, fd: FormData): Promise<TotpState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const parsed = totpSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const meta = await requestMeta();
  let backupCodes: string[] | null = null;
  try {
    await enforceRateLimit("login", `2fa:${meta.ip ?? "unknown"}:${session.user.id}`);
    ({ backupCodes } = await checkTotp(session.user.id, parsed.data.code));
  } catch (e) {
    if (e instanceof AccountError) return { fieldErrors: { code: [e.message] } };
    if (e instanceof RateLimitError) return { error: e.message };
    throw e;
  }
  await unstable_update({ mfaProof: signMfaProof(session.user.id) } as never);
  // First enrolment: show the one-time backup codes before entering the portal (D-123).
  if (backupCodes) return { ok: true, backupCodes, next: portalForRole(session.user.role) };
  redirect(portalForRole(session.user.role));
}

/** 2FA recovery with a one-time backup code (D-123). Same rate limit as TOTP attempts. */
export async function verifyBackupCodeAction(_: TotpState, fd: FormData): Promise<TotpState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const parsed = backupCodeSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const meta = await requestMeta();
  try {
    await enforceRateLimit("login", `2fa:${meta.ip ?? "unknown"}:${session.user.id}`);
  } catch (e) {
    if (e instanceof RateLimitError) return { error: e.message };
    throw e;
  }
  if (!(await consumeBackupCode(session.user.id, parsed.data.backupCode))) {
    return { fieldErrors: { backupCode: ["That backup code isn't valid or was already used."] } };
  }
  await unstable_update({ mfaProof: signMfaProof(session.user.id) } as never);
  redirect(portalForRole(session.user.role));
}

export async function resendVerificationAction(): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const meta = await requestMeta();
  try {
    await enforceRateLimit("passwordReset", `verify:${meta.ip ?? "unknown"}:${session.user.id}`);
  } catch {
    return { error: "Please wait a few minutes before requesting another email." };
  }
  await sendVerificationEmail(session.user.id);
  return { ok: true };
}

export async function logoutAction() {
  const session = await auth();
  if (session?.user?.id) {
    await db.loginEvent.create({ data: { userId: session.user.id, email: session.user.email, success: true, reason: "logout" } });
  }
  await signOut({ redirectTo: "/login" });
}
