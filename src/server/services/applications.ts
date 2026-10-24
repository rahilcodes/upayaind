import "server-only";
import Papa from "papaparse";
import { z } from "zod";
import type { ApplicationStatus, EmploymentType, JobSource, Role, WorkMode } from "@/generated/prisma/enums";
import { db, Prisma, type Tx } from "@/server/db";
import { assertEmployeeCanAccessStudent, ForbiddenError } from "@/server/auth/access";
import { domainFromUrl, normalizeJobUrl } from "@/lib/url-normalize";
import { dateOnly, dayKey, dayRangeInTz, startOfDayInTz } from "@/lib/dates";
import { formatDate, formatInTz } from "@/lib/format";
import { firstName } from "@/lib/utils";
import { audit } from "./audit";
import { deleteObject, LIMITS, storeUpload } from "./files";
import { notify, notifyManagers } from "./notify";
import { sendAlert } from "./alerts";
import { getSetting } from "./settings";
import { getOrCreateBaseVersion, type StoredValidation } from "./resumes";
import { parseSchedule, windowStatus } from "./work-window";
import { log } from "@/server/log";
import { isManagerial } from "@/server/auth/rbac";

/**
 * Applications (SPEC F4 logging + F5 status lifecycle).
 * Every exported function takes the acting user and enforces access:
 * staff → assertEmployeeCanAccessStudent; students → ownership.
 */

export class ApplicationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

type Actor = { id: string; role: Role; timezone?: string };

export const WORK_MODES = ["ONSITE", "HYBRID", "REMOTE"] as const satisfies readonly WorkMode[];
export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY"] as const satisfies readonly EmploymentType[];
export const JOB_SOURCES = ["LINKEDIN", "INDEED", "COMPANY_SITE", "DICE", "GLASSDOOR", "ZIPRECRUITER", "HANDSHAKE", "REFERRAL", "OTHER"] as const satisfies readonly JobSource[];
export const INTERVIEW_ROUNDS = ["Recruiter screen", "Technical", "Hiring manager", "Panel", "HR", "Final", "Other"] as const;
export const INTERVIEW_MODES = ["Phone", "Video", "Onsite"] as const;

export const EDIT_WINDOW_DAYS = 7;
const SIMILAR_DAYS = 60;
const SIMILARITY = 0.85;

// ─────────────────────────── Shared input schemas ───────────────────────────

const httpUrl = z
  .string()
  .trim()
  .min(1, "Job URL is required.")
  .max(2000)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Enter a valid job URL.");

export const JobFields = z.object({
  studentId: z.string().min(1),
  jobUrl: httpUrl,
  companyName: z.string().trim().min(1, "Company is required.").max(200),
  /** Optional: from the company autocomplete (D-102); otherwise derived from the job URL. */
  companyDomain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a valid domain.")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  jobTitle: z.string().trim().min(1, "Job title is required.").max(200),
  location: z.string().trim().max(200).optional().nullable(),
  workMode: z.enum(WORK_MODES).optional().nullable(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional().nullable(),
  source: z.enum(JOB_SOURCES).default("OTHER"),
  salaryText: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});
export type JobFieldsInput = z.input<typeof JobFields>;

// ─────────────────────────── Access helpers ───────────────────────────

/**
 * Staff acting on a student: checks the assignment and resolves the EmployeeProfile to credit.
 * Employees with an enforced working window (D-139) must be clocked in and inside
 * the window to log applications; managers and admins are exempt.
 */
async function staffContext(user: Actor, studentId: string, client: Tx | typeof db = db, now = new Date()) {
  const { employeeProfileId } = await assertEmployeeCanAccessStudent(user, studentId, client);
  let employeeId = employeeProfileId;
  if (!employeeId) {
    // Admin without an EmployeeProfile: credit the student's current primary employee.
    const a = await client.assignment.findFirst({ where: { studentId, isActive: true, type: "PRIMARY" }, select: { employeeId: true }, orderBy: { startsAt: "desc" } });
    employeeId = a?.employeeId ?? null;
  }
  if (!employeeId) throw new ApplicationError("No employee profile to credit this application to. Assign the applicant to an employee first.");
  if (user.role === "EMPLOYEE") await assertInsideWorkWindow(employeeId, client, now);
  return { employeeId };
}

async function assertInsideWorkWindow(employeeId: string, client: Tx | typeof db, now: Date) {
  const e = await client.employeeProfile.findUnique({ where: { id: employeeId }, select: { workSchedule: true, user: { select: { timezone: true } } } });
  if (!e) return;
  const schedule = parseSchedule(e.workSchedule, e.user.timezone);
  if (!schedule.enforceWindow) return;
  // The window's own zone, never the employee's editable User.timezone.
  const w = windowStatus(schedule, schedule.timezone ?? e.user.timezone, now);
  const clockedIn = w.inWindow ? await client.workSession.findFirst({ where: { employeeId, endedAt: null }, select: { id: true } }) : null;
  if (!w.inWindow || !clockedIn) {
    throw new ApplicationError(`You can only log applications while clocked in during your working window (${w.label}).`, undefined, "outside_window");
  }
}

async function studentProfileIdFor(user: Actor) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!s) throw new ForbiddenError();
  return s.id;
}

/** Active subscription + plan target for a student. */
export async function getSubscriptionState(studentId: string) {
  const sub = await db.subscription.findFirst({
    where: { studentId },
    orderBy: [{ createdAt: "desc" }],
    select: { status: true, currentPeriodEnd: true, planPrice: { select: { dailyTarget: true, plan: { select: { name: true } } } } },
  });
  const active = await db.subscription.findFirst({
    where: { studentId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: { status: true, currentPeriodEnd: true, planPrice: { select: { dailyTarget: true, plan: { select: { name: true } } } } },
  });
  const s = active ?? sub;
  return {
    active: Boolean(active),
    status: s?.status ?? null,
    planName: s?.planPrice.plan.name ?? null,
    dailyTarget: s?.planPrice.dailyTarget ?? 0,
    periodEnd: s?.currentPeriodEnd ?? null,
  };
}

async function assertSubscriptionActive(studentId: string) {
  const s = await getSubscriptionState(studentId);
  if (!s.active) throw new ApplicationError("This applicant's subscription isn't active, so applications can't be logged.", undefined, "inactive_subscription");
  return s;
}

// ─────────────────────────── Duplicate checks (F4) ───────────────────────────

/** "Acme, Inc." → "acme" for avoid-list matching. */
export function normalizeCompany(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(inc|incorporated|llc|ltd|limited|plc|corp|corporation|co|company|gmbh|pvt|private|group|holdings|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DuplicateCheck = {
  block: null | { code: "same_url" | "avoid_company"; message: string; applicationId?: string };
  warnings: { code: "similar"; message: string; applicationId: string; companyName: string; jobTitle: string; appliedAt: string | null; similarity: number }[];
  normalizedUrl: string | null;
};

/**
 * Duplicate rules (SPEC F4):
 * 1. same normalised job URL for this student → block ("Already applied on 3 Oct by Arjun")
 * 2. company is in the student's avoid list → block
 * 3. company + title trigram similarity ≥ 0.85 within 60 days → warning (must confirm)
 */
export async function checkDuplicates(user: Actor, input: { studentId: string; jobUrl?: string | null; companyName?: string | null; jobTitle?: string | null; excludeApplicationId?: string }, opts: { skipAccess?: boolean } = {}): Promise<DuplicateCheck> {
  if (!opts.skipAccess) await assertEmployeeCanAccessStudent(user, input.studentId);
  const tz = user.timezone ?? "UTC";
  const out: DuplicateCheck = { block: null, warnings: [], normalizedUrl: null };

  if (input.jobUrl?.trim()) {
    const parsed = httpUrl.safeParse(input.jobUrl);
    const n = normalizeJobUrl(parsed.success ? parsed.data : input.jobUrl);
    out.normalizedUrl = n;
    const prev = await db.jobApplication.findFirst({
      where: { studentId: input.studentId, jobUrlNormalized: n, ...(input.excludeApplicationId ? { id: { not: input.excludeApplicationId } } : {}) },
      select: { id: true, appliedAt: true, createdAt: true, employee: { select: { user: { select: { name: true } } } } },
    });
    if (prev) {
      out.block = {
        code: "same_url",
        applicationId: prev.id,
        message: `Already applied on ${formatInTz(prev.appliedAt ?? prev.createdAt, tz, "d MMM")} by ${firstName(prev.employee.user.name)}.`,
      };
      return out;
    }
  }

  if (input.companyName?.trim()) {
    const s = await db.studentProfile.findUnique({ where: { id: input.studentId }, select: { avoidCompanies: true } });
    const c = normalizeCompany(input.companyName);
    const hit = (s?.avoidCompanies ?? []).find((a) => {
      const n = normalizeCompany(a);
      return n && (n === c || (n.length >= 4 && c.startsWith(`${n} `)) || (c.length >= 4 && n.startsWith(`${c} `)));
    });
    if (hit) {
      out.block = { code: "avoid_company", message: `${input.companyName.trim()} is on this student's "companies to avoid" list (${hit}).` };
      return out;
    }
  }

  if (input.companyName?.trim() && input.jobTitle?.trim()) {
    const probe = `${input.companyName.trim()} ${input.jobTitle.trim()}`.toLowerCase();
    const since = new Date(Date.now() - SIMILAR_DAYS * 86400e3);
    const rows = await db.$queryRaw<{ id: string; companyName: string; jobTitle: string; appliedAt: Date | null; sim: number }[]>`
      SELECT id, "companyName", "jobTitle", "appliedAt", similarity(lower("companyName" || ' ' || "jobTitle"), ${probe})::float8 AS sim
      FROM "JobApplication"
      WHERE "studentId" = ${input.studentId}
        AND COALESCE("appliedAt", "createdAt") >= ${since}
        AND id <> ${input.excludeApplicationId ?? ""}
        AND similarity(lower("companyName" || ' ' || "jobTitle"), ${probe}) >= ${SIMILARITY}
      ORDER BY sim DESC
      LIMIT 3`;
    out.warnings = rows.map((r) => ({
      code: "similar" as const,
      applicationId: r.id,
      companyName: r.companyName,
      jobTitle: r.jobTitle,
      appliedAt: r.appliedAt?.toISOString() ?? null,
      similarity: Math.round(r.sim * 100) / 100,
      message: `Similar application: ${r.jobTitle} at ${r.companyName}${r.appliedAt ? ` on ${formatInTz(r.appliedAt, tz, "d MMM")}` : ""}.`,
    }));
  }
  return out;
}

function enforceDuplicateResult(d: DuplicateCheck, confirmSimilar: boolean) {
  if (d.block) throw new ApplicationError(d.block.message, d.block.code === "same_url" ? "jobUrl" : "companyName", d.block.code);
  if (d.warnings.length && !confirmSimilar) throw new ApplicationError(`${d.warnings[0]!.message} Confirm to log it anyway.`, "companyName", "similar_needs_confirmation");
}

// ─────────────────────────── Counters (F10 StudentDay) ───────────────────────────

/** Recount a student's applications for one calendar day (in `tz`) and upsert StudentDay. Idempotent. */
export async function recountStudentDay(studentId: string, instant: Date, tz: string, client: Tx | typeof db = db) {
  const { start, end, key } = dayRangeInTz(instant, tz);
  const applied = await client.jobApplication.count({ where: { studentId, appliedAt: { gte: start, lt: end } } });
  const target = (await getSubscriptionState(studentId)).dailyTarget;
  await client.studentDay.upsert({
    where: { studentId_date: { studentId, date: dateOnly(key) } },
    update: { applied },
    create: { studentId, date: dateOnly(key), applied, target },
  });
  return { applied, target, key };
}

/** "Today: 18 / 25" for the workspace (day boundaries in the employee's timezone). */
export async function getTodayCounter(studentId: string, tz: string) {
  const { start, end } = dayRangeInTz(new Date(), tz);
  const [applied, sub] = await Promise.all([db.jobApplication.count({ where: { studentId, appliedAt: { gte: start, lt: end } } }), getSubscriptionState(studentId)]);
  return { applied, target: sub.dailyTarget };
}

async function employeeTimezone(employeeId: string) {
  const e = await db.employeeProfile.findUnique({ where: { id: employeeId }, select: { user: { select: { timezone: true } } } });
  return e?.user.timezone ?? "UTC";
}

// ─────────────────────────── Mark as applied (F4) ───────────────────────────

export const MarkAppliedInput = JobFields.extend({
  resumeVersionId: z.string().min(1, "Generate or pick a resume first."),
  jdText: z.string().trim().max(20_000).optional().nullable(),
  coverLetter: z.string().trim().max(4000).optional().nullable(),
  proofText: z.string().trim().max(20_000).optional().nullable(),
  confirmSimilar: z.boolean().default(false),
});
export type MarkAppliedInputT = z.input<typeof MarkAppliedInput>;

type Proof = { buffer: Buffer; filename?: string } | null;

async function createApplication(
  user: Actor,
  input: z.infer<typeof MarkAppliedInput> & { appliedAt?: Date },
  proof: Proof,
  opts: { requireValid: boolean; event: string },
) {
  const { employeeId } = await staffContext(user, input.studentId);
  await assertSubscriptionActive(input.studentId);

  const version = await db.resumeVersion.findUnique({ where: { id: input.resumeVersionId }, select: { id: true, studentId: true, kind: true, validation: true, lockedAt: true, coverLetter: true } });
  if (!version || version.studentId !== input.studentId) throw new ApplicationError("That resume doesn't belong to this applicant.", "resumeVersionId");
  if (version.kind === "MASTER_UPLOAD") throw new ApplicationError("Use the base or a tailored resume, not the original upload.", "resumeVersionId");
  const validation = version.validation as StoredValidation | null;
  if (opts.requireValid && validation && validation.ok === false) {
    throw new ApplicationError("This resume failed the truthfulness check. Fix the highlighted problems in the editor before marking it as applied.", "resumeVersionId", "validation_failed");
  }

  const dup = await checkDuplicates(user, { studentId: input.studentId, jobUrl: input.jobUrl, companyName: input.companyName, jobTitle: input.jobTitle }, { skipAccess: true });
  enforceDuplicateResult(dup, input.confirmSimilar);
  const normalized = normalizeJobUrl(input.jobUrl);

  let proofKey: string | null = null;
  if (proof) {
    const f = await storeUpload({ buffer: proof.buffer, filename: proof.filename, ownerUserId: user.id, studentId: input.studentId, purpose: "proof", allowed: ["png", "jpg"], maxBytes: LIMITS.proof, keyPrefix: `students/${input.studentId}/proof` });
    proofKey = f.key;
  }

  const appliedAt = input.appliedAt ?? new Date();
  try {
    const app = await db.$transaction(async (tx) => {
      const created = await tx.jobApplication.create({
        data: {
          studentId: input.studentId,
          employeeId,
          companyName: input.companyName,
          companyDomain: input.companyDomain || domainFromUrl(input.jobUrl),
          jobTitle: input.jobTitle,
          jobUrl: input.jobUrl,
          jobUrlNormalized: normalized,
          location: input.location || null,
          workMode: input.workMode ?? null,
          employmentType: input.employmentType ?? null,
          source: input.source,
          jdText: input.jdText || null,
          salaryText: input.salaryText || null,
          notes: input.notes || null,
          status: "APPLIED",
          appliedAt,
          lastStatusAt: appliedAt,
          resumeVersionId: version.id,
          coverLetter: (input.coverLetter ?? version.coverLetter) || null,
          proofKey,
          proofText: input.proofText || null,
        },
        select: { id: true, appliedAt: true },
      });
      await tx.applicationEvent.create({ data: { applicationId: created.id, fromStatus: null, toStatus: "APPLIED", byUserId: user.id, at: appliedAt, note: opts.event === "applied" ? null : opts.event } });
      // Lock the resume: immutable from now on (SPEC Glossary "Tailored resume").
      if (!version.lockedAt) await tx.resumeVersion.updateMany({ where: { id: version.id, lockedAt: null }, data: { lockedAt: appliedAt } });
      return created;
    });
    // StudentDay is kept in the crediting employee's timezone (F10).
    await recountStudentDay(input.studentId, appliedAt, await employeeTimezone(employeeId));
    return { applicationId: app.id, appliedAt: app.appliedAt!, today: await getTodayCounter(input.studentId, user.timezone ?? (await employeeTimezone(employeeId))) };
  } catch (e) {
    if (proofKey) await deleteObject(proofKey).catch(() => undefined);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApplicationError("This job URL was just logged for this applicant by someone else.", "jobUrl", "same_url");
    }
    throw e;
  }
}

/**
 * "Mark as applied": creates a JobApplication (APPLIED) + ApplicationEvent,
 * locks the ResumeVersion, stores JD / cover letter / metadata / proof, and
 * updates the student's day counter. Refuses when the subscription isn't
 * ACTIVE or the resume failed validation.
 */
export async function markApplied(user: Actor, raw: MarkAppliedInputT, proof: Proof = null) {
  const input = MarkAppliedInput.parse(raw);
  if (proof && input.proofText) throw new ApplicationError("Attach a screenshot or paste the confirmation text — not both.", "proof");
  return createApplication(user, input, proof, { requireValid: true, event: "applied" });
}

// ─────────────────────────── Quick log (no AI) ───────────────────────────

export const QuickLogInput = JobFields.extend({
  resumeVersionId: z.string().min(1).or(z.literal("base")).default("base"),
  proofText: z.string().trim().max(20_000).optional().nullable(),
  confirmSimilar: z.boolean().default(false),
});

/** Log an application with the base resume or a previously used version (same duplicate rules). */
export async function quickLog(user: Actor, raw: z.input<typeof QuickLogInput>, proof: Proof = null) {
  const input = QuickLogInput.parse(raw);
  await assertEmployeeCanAccessStudent(user, input.studentId);
  const versionId = input.resumeVersionId === "base" ? (await getOrCreateBaseVersion(user, input.studentId)).id : input.resumeVersionId;
  return createApplication(user, { ...input, resumeVersionId: versionId, jdText: null, coverLetter: null }, proof, { requireValid: true, event: "Quick log" });
}

/** Versions an employee can reuse in Quick log: base + tailored versions (newest first). */
export async function listReusableVersions(user: Actor, studentId: string) {
  await assertEmployeeCanAccessStudent(user, studentId);
  return db.resumeVersion.findMany({
    where: { studentId, kind: { in: ["BASE", "TAILORED"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, kind: true, title: true, createdAt: true, lockedAt: true, atsScore: true },
  });
}

// ─────────────────────────── Edit own entries (7 days) ───────────────────────────

export const EditApplicationInput = z.object({
  applicationId: z.string().min(1),
  jobUrl: httpUrl.optional(),
  companyName: z.string().trim().min(1).max(200).optional(),
  jobTitle: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().max(200).nullable().optional(),
  workMode: z.enum(WORK_MODES).nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
  source: z.enum(JOB_SOURCES).optional(),
  salaryText: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  proofText: z.string().trim().max(20_000).nullable().optional(),
});

/** Employees may edit applications they logged within 7 days; managers/admins any. The resume can't change. */
export async function editApplication(user: Actor, raw: z.input<typeof EditApplicationInput>) {
  const input = EditApplicationInput.parse(raw);
  const app = await db.jobApplication.findUnique({ where: { id: input.applicationId }, select: { id: true, studentId: true, employeeId: true, createdAt: true, companyName: true, jobTitle: true, jobUrl: true } });
  if (!app) throw new ApplicationError("Application not found.");
  const { employeeProfileId } = await assertEmployeeCanAccessStudent(user, app.studentId);
  if (user.role === "EMPLOYEE") {
    if (app.employeeId !== employeeProfileId) throw new ForbiddenError("You can only edit applications you logged.");
    if (Date.now() - app.createdAt.getTime() > EDIT_WINDOW_DAYS * 86400e3) throw new ApplicationError(`Applications can only be edited within ${EDIT_WINDOW_DAYS} days of logging. Ask a manager for changes.`);
  }
  const data: Prisma.JobApplicationUpdateInput = {};
  if (input.jobUrl && input.jobUrl !== app.jobUrl) {
    const d = await checkDuplicates(user, { studentId: app.studentId, jobUrl: input.jobUrl, excludeApplicationId: app.id }, { skipAccess: true });
    if (d.block) throw new ApplicationError(d.block.message, "jobUrl", d.block.code);
    data.jobUrl = input.jobUrl;
    data.jobUrlNormalized = normalizeJobUrl(input.jobUrl);
    data.companyDomain = domainFromUrl(input.jobUrl);
  }
  for (const k of ["companyName", "jobTitle", "location", "workMode", "employmentType", "source", "salaryText", "notes", "proofText"] as const) {
    if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k] === "" ? null : input[k];
  }
  const updated = await db.jobApplication.update({ where: { id: app.id }, data, select: { id: true, companyName: true, jobTitle: true, jobUrl: true } });
  await audit({ actorId: user.id, action: "application.edit", entity: "JobApplication", entityId: app.id, before: { companyName: app.companyName, jobTitle: app.jobTitle, jobUrl: app.jobUrl }, after: updated });
  return updated;
}

// ─────────────────────────── CSV bulk import ───────────────────────────

export const CSV_COLUMNS = ["job_url", "company", "title", "location", "source", "applied_at", "resume_version_id"] as const;
const SOURCE_ALIASES: Record<string, JobSource> = {
  linkedin: "LINKEDIN",
  indeed: "INDEED",
  dice: "DICE",
  glassdoor: "GLASSDOOR",
  ziprecruiter: "ZIPRECRUITER",
  "zip recruiter": "ZIPRECRUITER",
  handshake: "HANDSHAKE",
  referral: "REFERRAL",
  company: "COMPANY_SITE",
  "company site": "COMPANY_SITE",
  "company website": "COMPANY_SITE",
  company_site: "COMPANY_SITE",
  careers: "COMPANY_SITE",
  other: "OTHER",
};

export type ImportRow = {
  row: number; // 1-based data row (header excluded)
  jobUrl: string;
  companyName: string;
  jobTitle: string;
  location: string | null;
  source: JobSource;
  appliedAt: string; // ISO
  resumeVersionId: string | null;
  errors: string[];
  warnings: string[];
};

export const MAX_IMPORT_ROWS = 500;

function parseAppliedAt(v: string, tz: string): Date | null {
  const s = v.trim();
  if (!s) return new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(startOfDayInTz(s, tz).getTime() + 12 * 3600e3);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) return new Date(startOfDayInTz(`${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`, tz).getTime() + 12 * 3600e3);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse + validate a CSV for one student (no writes). Same duplicate rules as manual logging. */
export async function previewCsvImport(user: Actor, studentId: string, csv: string): Promise<{ rows: ImportRow[]; valid: number; invalid: number; missingColumns: string[] }> {
  await assertEmployeeCanAccessStudent(user, studentId);
  const tz = user.timezone ?? "UTC";
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_") });
  const fields = parsed.meta.fields ?? [];
  const missingColumns = ["job_url", "company", "title"].filter((c) => !fields.includes(c));
  if (missingColumns.length) return { rows: [], valid: 0, invalid: 0, missingColumns };
  if (parsed.data.length > MAX_IMPORT_ROWS) throw new ApplicationError(`Import at most ${MAX_IMPORT_ROWS} rows at a time.`);

  const versions = new Set((await db.resumeVersion.findMany({ where: { studentId, kind: { in: ["BASE", "TAILORED"] } }, select: { id: true } })).map((v) => v.id));
  const seenUrls = new Map<string, number>();
  const rows: ImportRow[] = [];
  for (const [i, r] of parsed.data.entries()) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const url = httpUrl.safeParse(r.job_url ?? "");
    if (!url.success) errors.push(url.error.issues[0]?.message ?? "Invalid job URL.");
    const company = (r.company ?? "").trim();
    const title = (r.title ?? "").trim();
    if (!company) errors.push("Company is required.");
    if (!title) errors.push("Title is required.");
    const srcRaw = (r.source ?? "").trim();
    const source = srcRaw ? (SOURCE_ALIASES[srcRaw.toLowerCase()] ?? (JOB_SOURCES.includes(srcRaw.toUpperCase() as JobSource) ? (srcRaw.toUpperCase() as JobSource) : null)) : "OTHER";
    if (!source) errors.push(`Unknown source "${srcRaw}".`);
    const appliedAt = parseAppliedAt(r.applied_at ?? "", tz);
    if (!appliedAt) errors.push(`Can't read applied_at "${r.applied_at}". Use YYYY-MM-DD.`);
    else if (appliedAt.getTime() > Date.now() + 5 * 60e3) errors.push("applied_at is in the future.");
    const rv = (r.resume_version_id ?? "").trim() || null;
    if (rv && !versions.has(rv)) errors.push("resume_version_id doesn't belong to this student.");

    if (url.success) {
      const n = normalizeJobUrl(url.data);
      const prior = seenUrls.get(n);
      if (prior) errors.push(`Same job URL as row ${prior}.`);
      else seenUrls.set(n, i + 1);
    }
    if (!errors.length) {
      const d = await checkDuplicates(user, { studentId, jobUrl: url.success ? url.data : null, companyName: company, jobTitle: title }, { skipAccess: true });
      if (d.block) errors.push(d.block.message);
      for (const w of d.warnings) warnings.push(w.message);
    }
    rows.push({
      row: i + 1,
      jobUrl: url.success ? url.data : (r.job_url ?? ""),
      companyName: company,
      jobTitle: title,
      location: (r.location ?? "").trim() || null,
      source: source ?? "OTHER",
      appliedAt: (appliedAt ?? new Date()).toISOString(),
      resumeVersionId: rv,
      errors,
      warnings,
    });
  }
  const valid = rows.filter((r) => !r.errors.length).length;
  return { rows, valid, invalid: rows.length - valid, missingColumns: [] };
}

/**
 * Import the valid rows. Rows with similarity warnings are imported only when
 * `confirmWarnings` is true. Rows without resume_version_id use the base resume.
 */
export async function commitCsvImport(user: Actor, studentId: string, csv: string, opts: { confirmWarnings?: boolean } = {}) {
  const preview = await previewCsvImport(user, studentId, csv);
  if (preview.missingColumns.length) throw new ApplicationError(`Missing column(s): ${preview.missingColumns.join(", ")}.`);
  await assertSubscriptionActive(studentId);
  const { employeeId } = await staffContext(user, studentId);
  const importable = preview.rows.filter((r) => !r.errors.length && (opts.confirmWarnings || !r.warnings.length));
  if (!importable.length) return { imported: 0, skipped: preview.rows.length };
  const baseId = importable.some((r) => !r.resumeVersionId) ? (await getOrCreateBaseVersion(user, studentId)).id : null;

  let imported = 0;
  await db.$transaction(async (tx) => {
    for (const r of importable) {
      const appliedAt = new Date(r.appliedAt);
      const created = await tx.jobApplication.create({
        data: {
          studentId,
          employeeId,
          companyName: r.companyName,
          companyDomain: domainFromUrl(r.jobUrl),
          jobTitle: r.jobTitle,
          jobUrl: r.jobUrl,
          jobUrlNormalized: normalizeJobUrl(r.jobUrl),
          location: r.location,
          source: r.source,
          status: "APPLIED",
          appliedAt,
          lastStatusAt: appliedAt,
          resumeVersionId: r.resumeVersionId ?? baseId,
        },
        select: { id: true },
      });
      await tx.applicationEvent.create({ data: { applicationId: created.id, fromStatus: null, toStatus: "APPLIED", byUserId: user.id, at: appliedAt, note: "CSV import" } });
      imported++;
    }
    const ids = [...new Set(importable.map((r) => r.resumeVersionId ?? baseId).filter((x): x is string => Boolean(x)))];
    await tx.resumeVersion.updateMany({ where: { id: { in: ids }, lockedAt: null }, data: { lockedAt: new Date() } });
  });
  const tz = await employeeTimezone(employeeId);
  const days = new Set(importable.map((r) => dayKey(new Date(r.appliedAt), tz)));
  for (const k of days) await recountStudentDay(studentId, new Date(startOfDayInTz(k, tz).getTime() + 3600e3), tz);
  await audit({ actorId: user.id, action: "application.csv_import", entity: "StudentProfile", entityId: studentId, after: { imported } });
  return { imported, skipped: preview.rows.length - imported };
}

// ─────────────────────────── Status lifecycle (F5) ───────────────────────────

export const TERMINAL: ApplicationStatus[] = ["HIRED", "REJECTED", "WITHDRAWN"];

/** Allowed transitions. Managers/admins may override with `force` (a note is required). */
export const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  DRAFT: ["APPLIED", "WITHDRAWN"],
  APPLIED: ["VIEWED", "RECRUITER_REPLIED", "ASSESSMENT", "INTERVIEW_SCHEDULED", "REJECTED", "NO_RESPONSE", "WITHDRAWN", "ON_HOLD"],
  VIEWED: ["RECRUITER_REPLIED", "ASSESSMENT", "INTERVIEW_SCHEDULED", "REJECTED", "NO_RESPONSE", "WITHDRAWN", "ON_HOLD"],
  RECRUITER_REPLIED: ["ASSESSMENT", "INTERVIEW_SCHEDULED", "REJECTED", "WITHDRAWN", "ON_HOLD"],
  ASSESSMENT: ["INTERVIEW_SCHEDULED", "REJECTED", "WITHDRAWN", "ON_HOLD"],
  INTERVIEW_SCHEDULED: ["INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN", "ON_HOLD"],
  INTERVIEWING: ["INTERVIEW_SCHEDULED", "OFFER", "REJECTED", "WITHDRAWN", "ON_HOLD"],
  OFFER: ["HIRED", "REJECTED", "WITHDRAWN"],
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
  NO_RESPONSE: ["VIEWED", "RECRUITER_REPLIED", "ASSESSMENT", "INTERVIEW_SCHEDULED", "REJECTED", "WITHDRAWN"],
  ON_HOLD: ["APPLIED", "VIEWED", "RECRUITER_REPLIED", "ASSESSMENT", "INTERVIEW_SCHEDULED", "INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN"],
};

export function canTransition(from: ApplicationStatus, to: ApplicationStatus) {
  return TRANSITIONS[from].includes(to);
}

export const InterviewInput = z.object({
  scheduledAt: z.coerce.date({ error: "Pick the interview date and time." }),
  timezone: z.string().trim().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone."),
  round: z.enum(INTERVIEW_ROUNDS),
  mode: z.enum(INTERVIEW_MODES),
  meetingLink: z.string().trim().url("Enter a valid meeting link.").max(1000).optional().nullable().or(z.literal("").transform(() => null)),
  interviewers: z.string().trim().max(500).optional().nullable(),
  prepNotes: z.string().trim().max(5000).optional().nullable(),
});
export type InterviewInputT = z.input<typeof InterviewInput>;

export const UpdateStatusInput = z.object({
  applicationId: z.string().min(1),
  to: z.enum(Object.keys(TRANSITIONS) as [ApplicationStatus, ...ApplicationStatus[]]),
  note: z.string().trim().max(2000).optional().nullable(),
  interview: InterviewInput.optional().nullable(),
  force: z.boolean().default(false),
});

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  APPLIED: "Applied",
  VIEWED: "Viewed",
  RECRUITER_REPLIED: "Recruiter replied",
  ASSESSMENT: "Assessment",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
  NO_RESPONSE: "No response",
  WITHDRAWN: "Withdrawn",
  ON_HOLD: "On hold",
};

const APP_SELECT = {
  id: true,
  studentId: true,
  employeeId: true,
  status: true,
  companyName: true,
  jobTitle: true,
  student: { select: { userId: true, user: { select: { name: true, timezone: true } } } },
  employee: { select: { userId: true } },
} satisfies Prisma.JobApplicationSelect;

type AppRow = Prisma.JobApplicationGetPayload<{ select: typeof APP_SELECT }>;

async function hasUpcomingInterview(tx: Tx | typeof db, applicationId: string) {
  return (await tx.interview.count({ where: { applicationId, scheduledAt: { gte: new Date(Date.now() - 12 * 3600e3) }, outcome: null } })) > 0;
}

async function applyTransition(
  tx: Tx,
  app: AppRow,
  to: ApplicationStatus,
  by: { userId: string | null; note?: string | null },
  interview: z.infer<typeof InterviewInput> | null,
) {
  let interviewId: string | null = null;
  if (interview) {
    const i = await tx.interview.create({ data: { applicationId: app.id, ...interview, meetingLink: interview.meetingLink || null, interviewers: interview.interviewers || null, prepNotes: interview.prepNotes || null }, select: { id: true } });
    interviewId = i.id;
  }
  if (to === "INTERVIEW_SCHEDULED" && !interviewId && !(await hasUpcomingInterview(tx, app.id))) {
    throw new ApplicationError("Add the interview details (date, time, round and mode) to mark it as scheduled.", "interview", "interview_required");
  }
  const now = new Date();
  // Optimistic concurrency: only move from the status we read.
  const r = await tx.jobApplication.updateMany({ where: { id: app.id, status: app.status }, data: { status: to, lastStatusAt: now } });
  if (r.count === 0) throw new ApplicationError("Someone else changed this application's status just now. Refresh and try again.");
  await tx.applicationEvent.create({ data: { applicationId: app.id, fromStatus: app.status, toStatus: to, byUserId: by.userId, note: by.note || null, at: now } });
  return { interviewId };
}

async function primaryEmployeeUserId(studentId: string, fallbackUserId: string) {
  const a = await db.assignment.findFirst({ where: { studentId, isActive: true, type: "PRIMARY" }, orderBy: { startsAt: "desc" }, select: { employee: { select: { userId: true } } } });
  return a?.employee.userId ?? fallbackUserId;
}

async function notifyTransition(app: AppRow, to: ApplicationStatus, opts: { byStudent: boolean; actorUserId: string; interview?: { scheduledAt: Date; timezone: string } | null }) {
  const studentTz = app.student.user.timezone;
  const base = { applicationId: app.id, company: app.companyName, title: app.jobTitle, studentId: app.studentId, studentName: app.student.user.name };
  try {
    if (to === "INTERVIEW_SCHEDULED" && !opts.byStudent) {
      const when = opts.interview ? `${formatInTz(opts.interview.scheduledAt, studentTz, "EEE d MMM, h:mm a")} (your time)` : null;
      await notify(app.student.userId, "status_interview", { ...base, when });
    }
    if ((to === "OFFER" || to === "HIRED") && !opts.byStudent) await notify(app.student.userId, "status_offer", base);
    if (to === "OFFER" || to === "HIRED") await notifyManagers("offer_admin", base);
    if (to === "OFFER" || to === "HIRED") void sendAlert("offer_hired", { title: `${app.student.user.name} → ${app.companyName}`, lines: [`${app.jobTitle} · ${to}`], link: `/admin/students/${app.studentId}`, linkLabel: "Open student" });
    if (opts.byStudent) {
      const empUserId = await primaryEmployeeUserId(app.studentId, app.employee.userId);
      await notify(empUserId, "status_update_employee", { ...base, status: STATUS_LABEL[to], byStudent: 1 });
    }
  } catch (e) {
    log.error("applications.notify_failed", { err: e });
  }
}

/**
 * Change an application's status (staff). Validates the transition, requires an
 * Interview record for INTERVIEW_SCHEDULED, writes an ApplicationEvent and
 * sends the F13 notifications (interview → student; offer/hired → student +
 * admins; testimonial request is sent 7 days later by a daily job).
 */
export async function updateStatus(user: Actor, raw: z.input<typeof UpdateStatusInput>) {
  const input = UpdateStatusInput.parse(raw);
  const app = await db.jobApplication.findUnique({ where: { id: input.applicationId }, select: APP_SELECT });
  if (!app) throw new ApplicationError("Application not found.");
  await assertEmployeeCanAccessStudent(user, app.studentId);
  if (app.status === input.to && !(input.to === "INTERVIEW_SCHEDULED" && input.interview)) throw new ApplicationError(`It's already "${STATUS_LABEL[input.to]}".`);
  const privileged = isManagerial(user.role);
  if (!canTransition(app.status, input.to) && app.status !== input.to) {
    if (!(input.force && privileged)) throw new ApplicationError(`Can't move from "${STATUS_LABEL[app.status]}" to "${STATUS_LABEL[input.to]}".`, "to", "invalid_transition");
    if (!input.note) throw new ApplicationError("Add a note explaining the override.", "note");
  }
  // Another interview round on an already-scheduled application: just add the interview.
  if (app.status === input.to && input.interview) {
    const i = await addInterview(user, app.id, input.interview);
    return { status: app.status, interviewId: i.id };
  }
  const result = await db.$transaction((tx) => applyTransition(tx, app, input.to, { userId: user.id, note: input.note }, input.interview ?? null));
  await notifyTransition(app, input.to, { byStudent: false, actorUserId: user.id, interview: input.interview ?? null });
  return { status: input.to, interviewId: result.interviewId };
}

/** Bulk status change (e.g. several → REJECTED). Each one is validated independently. */
export async function bulkUpdateStatus(user: Actor, ids: string[], to: ApplicationStatus, note?: string | null) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids.slice(0, 100)) {
    try {
      await updateStatus(user, { applicationId: id, to, note });
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

export const ReportOutcomeInput = z.object({
  applicationId: z.string().min(1),
  kind: z.enum(["interview", "offer"]),
  note: z.string().trim().max(2000).optional().nullable(),
  interview: InterviewInput.optional().nullable(),
});

/**
 * Student self-report (F5): "I got an interview / offer". Sets the status
 * (interview → INTERVIEW_SCHEDULED with an Interview record; offer → OFFER)
 * and notifies the employee to verify. Offers also notify admins.
 */
export async function reportOutcome(user: Actor, raw: z.input<typeof ReportOutcomeInput>) {
  const input = ReportOutcomeInput.parse(raw);
  const studentId = await studentProfileIdFor(user);
  const app = await db.jobApplication.findUnique({ where: { id: input.applicationId }, select: APP_SELECT });
  if (!app || app.studentId !== studentId) throw new ForbiddenError();
  const to: ApplicationStatus = input.kind === "offer" ? "OFFER" : "INTERVIEW_SCHEDULED";
  if (to === "INTERVIEW_SCHEDULED" && !input.interview) throw new ApplicationError("Tell us when the interview is (date, time, round and mode).", "interview", "interview_required");
  const note = `Reported by student${input.note ? `: ${input.note}` : ""}`;

  if (app.status === to && input.interview) {
    await db.interview.create({ data: { applicationId: app.id, ...input.interview, meetingLink: input.interview.meetingLink || null, interviewers: input.interview.interviewers || null, prepNotes: input.interview.prepNotes || null } });
    await notifyTransition(app, to, { byStudent: true, actorUserId: user.id });
    return { status: to };
  }
  if (!canTransition(app.status, to)) throw new ApplicationError(`This application is "${STATUS_LABEL[app.status]}", so it can't be reported as ${input.kind === "offer" ? "an offer" : "an interview"}. Message your specialist instead.`);
  await db.$transaction((tx) => applyTransition(tx, app, to, { userId: user.id, note }, input.interview ?? null));
  await notifyTransition(app, to, { byStudent: true, actorUserId: user.id });
  return { status: to };
}

// ─────────────────────────── Interviews ───────────────────────────

/** Add an interview (another round) to an application. Doesn't change the status. */
export async function addInterview(user: Actor, applicationId: string, raw: InterviewInputT) {
  const data = InterviewInput.parse(raw);
  const app = await db.jobApplication.findUnique({ where: { id: applicationId }, select: APP_SELECT });
  if (!app) throw new ApplicationError("Application not found.");
  await assertEmployeeCanAccessStudent(user, app.studentId);
  const i = await db.interview.create({ data: { applicationId, ...data, meetingLink: data.meetingLink || null, interviewers: data.interviewers || null, prepNotes: data.prepNotes || null }, select: { id: true } });
  await notify(app.student.userId, "status_interview", { applicationId: app.id, company: app.companyName, title: app.jobTitle, when: `${formatInTz(data.scheduledAt, app.student.user.timezone, "EEE d MMM, h:mm a")} (your time)` }).catch(() => undefined);
  return i;
}

export const UpdateInterviewInput = InterviewInput.partial().extend({ outcome: z.string().trim().max(500).nullable().optional() });

export async function updateInterview(user: Actor, interviewId: string, raw: z.input<typeof UpdateInterviewInput>) {
  const data = UpdateInterviewInput.parse(raw);
  const i = await db.interview.findUnique({ where: { id: interviewId }, select: { id: true, application: { select: { studentId: true } } } });
  if (!i) throw new ApplicationError("Interview not found.");
  await assertEmployeeCanAccessStudent(user, i.application.studentId);
  return db.interview.update({ where: { id: interviewId }, data, select: { id: true, scheduledAt: true, timezone: true, round: true, mode: true, meetingLink: true, interviewers: true, prepNotes: true, outcome: true } });
}

/** Interviews of one application (staff with access, or the owning student). */
export async function listInterviews(user: Actor, applicationId: string) {
  const app = await db.jobApplication.findUnique({ where: { id: applicationId }, select: { studentId: true } });
  if (!app) throw new ApplicationError("Application not found.");
  if (user.role === "STUDENT") {
    if ((await studentProfileIdFor(user)) !== app.studentId) throw new ForbiddenError();
  } else await assertEmployeeCanAccessStudent(user, app.studentId);
  return db.interview.findMany({ where: { applicationId }, orderBy: { scheduledAt: "asc" }, select: { id: true, scheduledAt: true, timezone: true, round: true, mode: true, meetingLink: true, interviewers: true, prepNotes: true, outcome: true } });
}

/** Status timeline (ApplicationEvent rows) for the detail page. */
export async function getTimeline(user: Actor, applicationId: string) {
  const app = await db.jobApplication.findUnique({ where: { id: applicationId }, select: { studentId: true } });
  if (!app) throw new ApplicationError("Application not found.");
  if (user.role === "STUDENT") {
    if ((await studentProfileIdFor(user)) !== app.studentId) throw new ForbiddenError();
  } else await assertEmployeeCanAccessStudent(user, app.studentId);
  const events = await db.applicationEvent.findMany({ where: { applicationId }, orderBy: { at: "asc" }, select: { id: true, fromStatus: true, toStatus: true, note: true, at: true, byUserId: true } });
  const users = await db.user.findMany({ where: { id: { in: events.map((e) => e.byUserId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true, role: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return events.map((e) => {
    const u = e.byUserId ? byId.get(e.byUserId) : null;
    // Students see their specialist's first name only (SPEC §20).
    const name = u ? (user.role === "STUDENT" && u.role !== "STUDENT" ? firstName(u.name) : u.name) : null;
    return { ...e, by: name, byRole: u?.role ?? null };
  });
}

// ─────────────────────────── Nightly jobs ───────────────────────────

/** APPLIED/VIEWED with no status change for `noResponseDays` → NO_RESPONSE (+ event). */
export async function runNoResponseSweep(now = new Date()) {
  const days = await getSetting("noResponseDays");
  const cutoff = new Date(now.getTime() - days * 86400e3);
  let total = 0;
  for (;;) {
    const batch = await db.jobApplication.findMany({ where: { status: { in: ["APPLIED", "VIEWED"] }, lastStatusAt: { lt: cutoff } }, select: { id: true, status: true }, take: 500 });
    if (!batch.length) break;
    await db.$transaction(async (tx) => {
      for (const a of batch) {
        const r = await tx.jobApplication.updateMany({ where: { id: a.id, status: a.status }, data: { status: "NO_RESPONSE", lastStatusAt: now } });
        if (r.count) await tx.applicationEvent.create({ data: { applicationId: a.id, fromStatus: a.status, toStatus: "NO_RESPONSE", note: `Auto: no response after ${days} days`, at: now } });
      }
    });
    total += batch.length;
    if (batch.length < 500) break;
  }
  return { updated: total, cutoff };
}

/**
 * Testimonial request 7 days after OFFER/HIRED (F5). Runs daily; sends at most
 * one request per application (tracked as a ProductEvent).
 */
export async function runTestimonialRequests(now = new Date()) {
  const from = new Date(now.getTime() - 30 * 86400e3);
  const to = new Date(now.getTime() - 7 * 86400e3);
  const events = await db.applicationEvent.findMany({
    where: { toStatus: { in: ["OFFER", "HIRED"] }, at: { gte: from, lte: to } },
    select: { applicationId: true, application: { select: { companyName: true, status: true, student: { select: { userId: true } } } } },
  });
  const sent = await db.productEvent.findMany({ where: { name: "testimonial_requested", createdAt: { gte: new Date(from.getTime() - 30 * 86400e3) } }, select: { userId: true, props: true } });
  const sentApps = new Set(sent.map((s) => (s.props as { applicationId?: string } | null)?.applicationId).filter(Boolean));
  const sentUsers = new Set(sent.map((s) => s.userId));
  let count = 0;
  for (const e of events) {
    const userId = e.application.student.userId;
    if (sentApps.has(e.applicationId) || sentUsers.has(userId)) continue;
    if (!["OFFER", "HIRED"].includes(e.application.status)) continue;
    await notify(userId, "testimonial_request", { company: e.application.companyName });
    await db.productEvent.create({ data: { name: "testimonial_requested", userId, props: { applicationId: e.applicationId } } });
    sentApps.add(e.applicationId);
    sentUsers.add(userId);
    count++;
  }
  return { sent: count };
}

// ─────────────────────────── Workspace data ───────────────────────────

/** Everything the /work/students/[id]/apply header and forms need. */
export async function getWorkspaceData(user: Actor, studentId: string) {
  const { employeeProfileId } = await assertEmployeeCanAccessStudent(user, studentId);
  const tz = user.timezone ?? "UTC";
  const s = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      masterProfile: true,
      templateId: true,
      avoidCompanies: true,
      targetTitles: true,
      user: { select: { name: true, timezone: true } },
      market: { select: { code: true, name: true, resumeStyle: { select: { code: true, name: true, documentTitle: true, pageSize: true, summaryLabel: true, maxPages: true, spelling: true } } } },
    },
  });
  if (!s) throw new ApplicationError("Applicant not found.");
  const [sub, today, companies, recent] = await Promise.all([
    getSubscriptionState(studentId),
    getTodayCounter(studentId, tz),
    db.jobApplication.findMany({
      where: employeeProfileId ? { OR: [{ studentId }, { employeeId: employeeProfileId }] } : { studentId },
      distinct: ["companyName"],
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { companyName: true },
    }),
    db.jobApplication.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, companyName: true, jobTitle: true, status: true, appliedAt: true, createdAt: true, employeeId: true, resumeVersionId: true },
    }),
  ]);
  return {
    student: { id: s.id, name: s.user.name, timezone: s.user.timezone, avoidCompanies: s.avoidCompanies, targetTitles: s.targetTitles, hasMaster: Boolean(s.masterProfile) },
    market: { code: s.market.code, name: s.market.name },
    style: s.market.resumeStyle,
    subscription: sub,
    today,
    companies: companies.map((c) => c.companyName),
    recent: recent.map((r) => ({ ...r, mine: r.employeeId === employeeProfileId, editable: r.employeeId === employeeProfileId && Date.now() - r.createdAt.getTime() < EDIT_WINDOW_DAYS * 86400e3 })),
    employeeTimezone: tz,
    todayLabel: formatDate(new Date(), tz),
  };
}

export { STATUS_LABEL };
