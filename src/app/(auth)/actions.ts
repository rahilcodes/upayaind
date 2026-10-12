"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, signIn, signOut, signMfaProof, unstable_update } from "@/server/auth";
import { portalForRole, isStaff } from "@/server/auth/rbac";
import { requestMeta } from "@/server/request";
import { enforceRateLimit, RateLimitError } from "@/server/services/ratelimit";
import {
  AccountError,
  acceptInvite,
  checkTotp,
  completeStudentProfile,
  registerStudent,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
} from "@/server/services/accounts";
import {
  completeProfileSchema,
  forgotSchema,
  loginSchema,
  phoneSchema,
  resetSchema,
  signupSchema,
  totpSchema,
} from "@/lib/schemas/auth";
import { db } from "@/server/db";

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
  const session = await auth();
  const role = session?.user?.role;
  if (!role) return { errorCode: "generic", values };
  if (isStaff(role)) redirect("/2fa");
  redirect(safeNext(parsed.data.next) ?? portalForRole(role));
}

export async function googleSignInAction(fd: FormData) {
  const plan = String(fd.get("plan") ?? "");
  const next = safeNext(String(fd.get("next") ?? "")) ?? (plan ? `/app/checkout?plan=${encodeURIComponent(plan)}` : "/app");
  await signIn("google", { redirectTo: next });
}

export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const values = valuesOf(fd, ["name", "email", "phone", "market", "plan", "consentTerms", "consentApply"]);
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
  const values = valuesOf(fd, ["phone", "market", "plan"]);
  const parsed = completeProfileSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  const phone = phoneSchema(parsed.data.market).safeParse(parsed.data.phone);
  if (!phone.success) return { fieldErrors: { phone: [phone.error.issues[0]!.message] }, values };
  try {
    await completeStudentProfile(session.user.id, { phone: phone.data, marketCode: parsed.data.market, timezone: parsed.data.timezone });
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
  try {
    ({ email } = await acceptInvite(parsed.data.token, parsed.data.password));
  } catch (e) {
    if (e instanceof AccountError) return e.field === "password" ? { fieldErrors: { password: [e.message] } } : { error: e.message };
    throw e;
  }
  await signIn("credentials", { email, password: parsed.data.password, redirect: false });
  redirect("/2fa");
}

export async function verifyTotpAction(_: FormState, fd: FormData): Promise<FormState> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const parsed = totpSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const meta = await requestMeta();
  try {
    await enforceRateLimit("login", `2fa:${meta.ip ?? "unknown"}:${session.user.id}`);
    await checkTotp(session.user.id, parsed.data.code);
  } catch (e) {
    if (e instanceof AccountError) return { fieldErrors: { code: [e.message] } };
    if (e instanceof RateLimitError) return { error: e.message };
    throw e;
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
