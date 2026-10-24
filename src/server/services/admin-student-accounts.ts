import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { hashPassword } from "@/server/auth/password";
import { can } from "@/server/auth/rbac";
import { UserError } from "@/server/errors";
import { emailSchema, passwordSchema, phoneSchema } from "@/lib/schemas/auth";
import { isValidTimezone, type LinksInput, type PreferencesInput } from "@/lib/schemas/student";
import { absoluteUrl } from "@/lib/utils";
import { bumpSessionVersion, checkPasswordPolicy, sendPasswordResetEmail, sendVerificationEmail } from "./accounts";
import { audit } from "./audit";
import { issueToken } from "./auth-tokens";
import { sendEmail } from "./email";
import { DIAL_CODES } from "./leads";
import { applyLinks, applyPreferences } from "./student-profile";

/**
 * Student accounts managed from the admin panel (D-147 part A): create a
 * student (invite or password), edit account / preferences / links, and
 * account actions (password reset, invite, verification, suspend, sign-out).
 * Requires `students.manage` (MANAGER, ADMIN). Every change is audit-logged.
 */

export class StudentAdminError extends UserError {}

type Actor = { id: string; role: Role };

function assertManage(actor: Actor) {
  if (!can(actor.role, "students.manage")) throw new ForbiddenError();
}

const nameSchema = z.string().trim().min(2, "Enter the full name.").max(120);
const marketCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Pick a market.");
const tzSchema = z.string().trim().max(64).refine((v) => !v || isValidTimezone(v), "Pick a valid time zone.").optional().nullable();
const phoneInput = z.string().trim().max(32).optional().nullable();
const phoneCountrySchema = z.string().trim().max(2).optional().nullable();

export const createStudentSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneInput,
  /** ISO country whose dialling rules parse a national phone number (defaults to the market). */
  phoneCountry: phoneCountrySchema,
  marketCode: marketCodeSchema,
  timezone: tzSchema,
  mode: z.enum(["invite", "password"]),
  password: z.string().max(128).optional().nullable(),
  sendEmail: z.boolean().default(true),
  notes: z.string().trim().max(10_000).optional().nullable(),
});
export type CreateStudentInput = z.input<typeof createStudentSchema>;

export const updateStudentAccountSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneInput,
  phoneCountry: phoneCountrySchema,
  timezone: z.string().trim().refine(isValidTimezone, "Pick a valid time zone."),
  marketCode: marketCodeSchema,
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
});
export type UpdateStudentAccountInput = z.input<typeof updateStudentAccountSchema>;

/** Markets + dialling codes for the create / account dialogs. */
export async function studentFormOptions() {
  const markets = await db.market.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { code: true, name: true, defaultTimezone: true } });
  return { markets, dialCodes: Object.entries(DIAL_CODES).map(([code, d]) => ({ code, label: `${code} ${d.dial}` })) };
}

async function activeMarket(code: string) {
  const market = await db.market.findFirst({ where: { code, isActive: true }, select: { id: true, code: true, defaultTimezone: true } });
  if (!market) throw new StudentAdminError("Pick an active market.", "marketCode");
  return market;
}

/** Optional phone → E.164 for the market (or the chosen dialling country). */
function parsePhone(raw: string | null | undefined, country: string) {
  if (!raw) return null;
  const r = phoneSchema(country).safeParse(raw);
  if (!r.success) throw new StudentAdminError("Enter a valid phone number with country code.", "phone");
  return r.data;
}

/** Case-insensitive uniqueness, including soft-deleted accounts (restore those instead). */
async function assertEmailFree(email: string, exceptUserId?: string) {
  const existing = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) }, select: { id: true, deletedAt: true, role: true } });
  if (!existing) return;
  if (existing.deletedAt) throw new StudentAdminError("An account with this email was deleted and is in its 30-day window. Restore it instead of creating a new one.", "email");
  throw new StudentAdminError("An account with this email already exists.", "email");
}

async function loadStudent(studentId: string) {
  const s = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      userId: true,
      marketId: true,
      market: { select: { code: true } },
      user: { select: { id: true, name: true, email: true, phone: true, timezone: true, status: true, emailVerified: true, deletedAt: true, passwordHash: true } },
    },
  });
  if (!s) throw new StudentAdminError("Student not found.");
  if (s.user.deletedAt) throw new StudentAdminError("This account is deleted. Restore it first.");
  return s;
}

// ─────────────────────────── Emails ───────────────────────────

async function sendStudentInviteEmail(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) throw new StudentAdminError("Student not found.");
  const token = await issueToken(userId, "INVITE");
  await sendEmail({
    to: user.email,
    subject: "Your UpayaInd account is ready",
    content: {
      preview: "Choose a password to get started with your job search.",
      heading: `Welcome, ${user.name.split(/\s+/)[0]}!`,
      paragraphs: [
        "Your specialist team at UpayaInd set up your account — choose a password to get started. You'll then tell us about the roles you want and we'll start applying for you.",
        "This link is valid for 7 days and can be used once.",
      ],
      cta: { label: "Choose my password", href: absoluteUrl(`/invite?token=${encodeURIComponent(token)}`) },
      footnote: "If you weren't expecting this email, you can ignore it.",
    },
  });
}

/** Password mode: where to sign in (the password itself is never emailed). */
async function sendLoginDetailsEmail(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  if (!user) return;
  await sendEmail({
    to: user.email,
    subject: "Your UpayaInd account is ready",
    content: {
      preview: "Log in with the email and password your specialist team gave you.",
      heading: `Welcome, ${user.name.split(/\s+/)[0]}!`,
      paragraphs: [
        `Your specialist team at UpayaInd set up your account for ${user.email}. Log in with the password they shared with you, then complete your profile so we can start applying for you.`,
        "You can change your password any time from Settings, or use “Forgot password?” on the login page.",
      ],
      cta: { label: "Log in", href: absoluteUrl("/login") },
      footnote: "If you weren't expecting this email, you can ignore it.",
    },
  });
}

// ─────────────────────────── Create ───────────────────────────

/**
 * Create a student account from the admin panel. Invite mode: User INVITED,
 * emailed a 7-day link to choose a password. Password mode: ACTIVE + verified.
 * Consents stay null — the student accepts the terms / placement agreement
 * during onboarding (CONSENT_VERSION is recorded there).
 */
export async function createStudent(actor: Actor, raw: CreateStudentInput) {
  assertManage(actor);
  const input = createStudentSchema.parse(raw);
  const market = await activeMarket(input.marketCode);
  const phone = parsePhone(input.phone, input.phoneCountry || market.code);
  let passwordHash: string | null = null;
  if (input.mode === "password") {
    const pw = passwordSchema.safeParse(input.password ?? "");
    if (!pw.success) throw new StudentAdminError(pw.error.issues[0]?.message ?? "Enter a password.", "password");
    await checkPasswordPolicy(pw.data, [input.name, input.email]);
    passwordHash = await hashPassword(pw.data);
  }
  await assertEmailFree(input.email);
  const timezone = input.timezone && isValidTimezone(input.timezone) ? input.timezone : market.defaultTimezone;
  const now = new Date();
  const status = input.mode === "password" ? "ACTIVE" : "INVITED";

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.name,
        phone,
        passwordHash,
        role: "STUDENT",
        status,
        timezone,
        emailVerified: input.mode === "password" ? now : null,
        student: { create: { marketId: market.id, internalNotes: input.notes?.trim() || null } },
      },
      select: { id: true, student: { select: { id: true } } },
    });
    const studentId = user.student!.id;
    await audit(
      { actorId: actor.id, action: "student.create", entity: "StudentProfile", entityId: studentId, after: { email: input.email, name: input.name, marketCode: market.code, timezone, mode: input.mode, status, sendEmail: input.sendEmail, createdBy: actor.id, consents: "pending onboarding" } },
      tx,
    );
    return { userId: user.id, studentId };
  });

  if (input.mode === "invite") await sendStudentInviteEmail(created.userId);
  else if (input.sendEmail) await sendLoginDetailsEmail(created.userId);
  return created;
}

// ─────────────────────────── Edit ───────────────────────────

/** Name / email / phone / timezone / market (+ optional ACTIVE ⇄ SUSPENDED). */
export async function updateStudentAccount(actor: Actor, studentId: string, raw: UpdateStudentAccountInput) {
  assertManage(actor);
  const input = updateStudentAccountSchema.parse(raw);
  const s = await loadStudent(studentId);
  const market = await activeMarket(input.marketCode);
  const phone = parsePhone(input.phone, input.phoneCountry || market.code);
  const emailChanged = input.email !== s.user.email.toLowerCase();
  if (emailChanged) await assertEmailFree(input.email, s.userId);
  const marketChanged = market.id !== s.marketId;
  if (marketChanged) {
    const live = await db.subscription.count({ where: { studentId, status: { in: ["ACTIVE", "PAUSED", "PAST_DUE"] } } });
    if (live) throw new StudentAdminError("This student has a live subscription priced for their current market. Change or end the plan first, then move the market.", "marketCode");
  }

  const before = { name: s.user.name, email: s.user.email, phone: s.user.phone, timezone: s.user.timezone, marketCode: s.market.code, emailVerified: Boolean(s.user.emailVerified) };
  const after = { name: input.name, email: input.email, phone, timezone: input.timezone, marketCode: market.code, emailVerified: emailChanged ? false : before.emailVerified };
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: s.userId },
      // A new address must be confirmed again, and every existing session is dropped (D-124).
      data: { name: input.name, email: input.email, phone, timezone: input.timezone, ...(emailChanged ? { emailVerified: null, sessionVersion: { increment: 1 } } : {}) },
    });
    if (marketChanged) await tx.studentProfile.update({ where: { id: studentId }, data: { marketId: market.id } });
    await audit({ actorId: actor.id, action: "student.account_update", entity: "StudentProfile", entityId: studentId, before, after: { ...after, sessionsRevoked: emailChanged } }, tx);
  });
  if (emailChanged) await sendVerificationEmail(s.userId);

  if (input.status && input.status !== s.user.status) {
    if (input.status === "SUSPENDED") await suspendStudent(actor, studentId, input.reason ?? "");
    else await reactivateStudent(actor, studentId);
  }
  return { ok: true, emailChanged, marketChanged };
}

export async function updateStudentPreferences(actor: Actor, studentId: string, raw: PreferencesInput) {
  assertManage(actor);
  const s = await loadStudent(studentId);
  const before = await db.studentProfile.findUniqueOrThrow({
    where: { id: s.id },
    select: { targetTitles: true, seniority: true, industries: true, locations: true, remoteOk: true, workModes: true, employmentTypes: true, minSalaryMinor: true, salaryCurrency: true, workAuthorization: true, needsSponsorship: true, willingToRelocate: true, noticePeriod: true, avoidCompanies: true, targetCompanies: true },
  });
  const after = await applyPreferences(s.id, raw);
  await audit({ actorId: actor.id, action: "student.preferences_update", entity: "StudentProfile", entityId: s.id, before, after });
  return { ok: true };
}

export async function updateStudentLinks(actor: Actor, studentId: string, raw: LinksInput) {
  assertManage(actor);
  const s = await loadStudent(studentId);
  const before = await db.studentProfile.findUniqueOrThrow({ where: { id: s.id }, select: { linkedinUrl: true, githubUrl: true, portfolioUrl: true } });
  const after = await applyLinks(s.id, raw);
  await audit({ actorId: actor.id, action: "student.links_update", entity: "StudentProfile", entityId: s.id, before, after });
  return { ok: true };
}

// ─────────────────────────── Account actions ───────────────────────────

export async function sendStudentPasswordReset(actor: Actor, studentId: string) {
  assertManage(actor);
  const s = await loadStudent(studentId);
  if (s.user.status === "DEACTIVATED") throw new StudentAdminError("This account is deactivated.");
  await sendPasswordResetEmail(s.userId, s.user.email);
  await audit({ actorId: actor.id, action: "student.password_reset_sent", entity: "StudentProfile", entityId: s.id });
  return { ok: true };
}

export async function resendStudentInvite(actor: Actor, studentId: string) {
  assertManage(actor);
  const s = await loadStudent(studentId);
  if (s.user.status !== "INVITED") throw new StudentAdminError("This student has already activated their account. Send a password reset instead.");
  await sendStudentInviteEmail(s.userId);
  await audit({ actorId: actor.id, action: "student.invite_resent", entity: "StudentProfile", entityId: s.id });
  return { ok: true };
}

export async function resendVerification(actor: Actor, studentId: string) {
  assertManage(actor);
  const s = await loadStudent(studentId);
  if (s.user.emailVerified) throw new StudentAdminError("This email is already verified.");
  await sendVerificationEmail(s.userId);
  await audit({ actorId: actor.id, action: "student.verification_resent", entity: "StudentProfile", entityId: s.id });
  return { ok: true };
}

export async function markEmailVerified(actor: Actor, studentId: string) {
  assertManage(actor);
  const s = await loadStudent(studentId);
  if (s.user.emailVerified) throw new StudentAdminError("This email is already verified.");
  const now = new Date();
  await db.user.update({ where: { id: s.userId }, data: { emailVerified: now } });
  await audit({ actorId: actor.id, action: "student.email_marked_verified", entity: "StudentProfile", entityId: s.id, before: { emailVerified: false }, after: { emailVerified: true, at: now } });
  return { ok: true };
}

/**
 * Suspend: the student can't sign in (auth refuses SUSPENDED), open sessions
 * end (sessionVersion bump, D-124) and unused links are revoked. Assignments
 * are deliberately KEPT: the specialist still sees the student and history
 * stays intact — only the student's own access is paused. The student is not
 * emailed; the reason lives in the audit log.
 */
export async function suspendStudent(actor: Actor, studentId: string, reason: string) {
  assertManage(actor);
  const s = await loadStudent(studentId);
  const why = z.string().trim().min(3, "Add a short reason.").max(500).parse(reason);
  if (s.user.status === "SUSPENDED") throw new StudentAdminError("This student is already suspended.");
  if (s.user.status === "DEACTIVATED") throw new StudentAdminError("This account is deactivated.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: s.userId }, data: { status: "SUSPENDED", sessionVersion: { increment: 1 } } });
    await tx.authToken.updateMany({ where: { userId: s.userId, consumedAt: null }, data: { consumedAt: new Date() } });
    await audit({ actorId: actor.id, action: "student.suspend", entity: "StudentProfile", entityId: s.id, before: { status: s.user.status }, after: { status: "SUSPENDED", reason: why, sessionsRevoked: true } }, tx);
  });
  return { ok: true };
}

export async function reactivateStudent(actor: Actor, studentId: string) {
  assertManage(actor);
  const s = await loadStudent(studentId);
  if (s.user.status !== "SUSPENDED") throw new StudentAdminError("This student isn't suspended.");
  const status = s.user.passwordHash ? "ACTIVE" : "INVITED";
  await db.user.update({ where: { id: s.userId }, data: { status } });
  await audit({ actorId: actor.id, action: "student.reactivate", entity: "StudentProfile", entityId: s.id, before: { status: "SUSPENDED" }, after: { status } });
  return { status };
}

/** Drop every session on every device (the student can sign in again right away). */
export async function signOutEverywhere(actor: Actor, studentId: string) {
  assertManage(actor);
  const s = await loadStudent(studentId);
  const sessionVersion = await bumpSessionVersion(s.userId, actor.id, "admin_sign_out");
  return { sessionVersion };
}
