import "server-only";
import Papa from "papaparse";
import { z } from "zod";
import type { ApplicationStatus, JobSource, Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { assertEmployeeCanAccessStudent } from "@/server/auth/access";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { passwordStrength } from "@/server/auth/strength";
import { addDayKey, dayKey, dayRangeInTz, startOfDayInTz } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { UserError } from "@/server/errors";
import { audit } from "./audit";
import { getSubscriptionState, JOB_SOURCES, STATUS_LABEL } from "./applications";
import { parseSchedule } from "./attendance";
import { assignedStudentIds, getStudentCards } from "./targets";
import { unreadCount } from "./messaging";

/**
 * Read models for the employee workspace (/work/*). Every function scopes
 * to the signed-in staff member: their EmployeeProfile, their currently
 * assigned students (PRIMARY + active COVER), or applications they logged.
 */

/** User-facing errors from this module (rendered by safeAction). */
export class WorkError extends UserError {}

type Actor = { id: string; role: Role; timezone?: string };

async function myProfile(user: Actor) {
  return db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true, employeeCode: true, workSchedule: true, user: { select: { timezone: true, name: true } } } });
}

// ───────────────────────────── Today (/work) ─────────────────────────────

export async function getTodayDashboard(user: Actor, now = new Date()) {
  const ep = await myProfile(user);
  if (!ep) return null;
  const tz = ep.user.timezone;
  const { cards, fraction, schedule } = await getStudentCards(ep.id, { now, viewerUserId: user.id });
  const ids = cards.map((c) => c.id);
  const weekEnd = startOfDayInTz(addDayKey(dayKey(now, tz), 7), tz);
  const [interviews, interviewsWeek, unread, events, newAssignments] = await Promise.all([
    ids.length
      ? db.interview.findMany({
          where: { scheduledAt: { gte: new Date(now.getTime() - 3600e3) }, outcome: null, application: { studentId: { in: ids } } },
          orderBy: { scheduledAt: "asc" },
          take: 5,
          select: { id: true, scheduledAt: true, round: true, mode: true, application: { select: { id: true, companyName: true, student: { select: { user: { select: { name: true } } } } } } },
        })
      : Promise.resolve([]),
    ids.length ? db.interview.count({ where: { scheduledAt: { gte: now, lt: weekEnd }, outcome: null, application: { studentId: { in: ids } } } }) : Promise.resolve(0),
    unreadCount(user),
    ids.length
      ? db.applicationEvent.findMany({
          where: { application: { studentId: { in: ids } }, at: { gte: new Date(now.getTime() - 3 * 86400e3) } },
          orderBy: { at: "desc" },
          take: 8,
          select: { id: true, at: true, toStatus: true, fromStatus: true, note: true, byUserId: true, application: { select: { id: true, companyName: true, jobTitle: true, student: { select: { userId: true, user: { select: { name: true } } } } } } },
        })
      : Promise.resolve([]),
    db.assignment.findMany({ where: { employeeId: ep.id, createdAt: { gte: new Date(now.getTime() - 3 * 86400e3) } }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, createdAt: true, type: true, student: { select: { user: { select: { name: true } } } } } }),
  ]);
  type Activity = { id: string; at: Date; kind: "applied" | "status" | "reported" | "assigned" | "cover"; student: string; company?: string; title?: string; status?: ApplicationStatus; applicationId?: string };
  const activity: Activity[] = [
    ...events.map((e): Activity => ({
      id: e.id,
      at: e.at,
      kind: e.fromStatus === null ? "applied" : e.byUserId === e.application.student.userId ? "reported" : "status",
      student: e.application.student.user.name,
      company: e.application.companyName,
      title: e.application.jobTitle,
      status: e.toStatus,
      applicationId: e.application.id,
    })),
    ...newAssignments.map((a): Activity => ({ id: a.id, at: a.createdAt, kind: a.type === "COVER" ? "cover" : "assigned", student: a.student.user.name })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  const activeCards = cards.filter((c) => c.active && c.target > 0);
  return {
    employeeCode: ep.employeeCode,
    timezone: tz,
    schedule,
    fraction,
    cards,
    stats: {
      applied: activeCards.reduce((a, c) => a + c.done, 0),
      target: activeCards.reduce((a, c) => a + c.target, 0),
      onTrack: activeCards.filter((c) => c.rag === "green" || c.rag === "done").length,
      behind: activeCards.filter((c) => c.rag === "amber").length,
      atRisk: activeCards.filter((c) => c.rag === "red").length,
      activeStudents: cards.filter((c) => c.active).length,
      interviewsWeek,
      nextInterviewAt: interviews.find((i) => i.scheduledAt >= now)?.scheduledAt ?? null,
      unread,
    },
    interviews: interviews.map((i) => ({ id: i.id, scheduledAt: i.scheduledAt, round: i.round, mode: i.mode, company: i.application.companyName, student: i.application.student.user.name, applicationId: i.application.id })),
    activity,
  };
}

// ───────────────────────────── My students (/work/students) ─────────────────────────────

export const StudentFilter = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive", "onboarding", "below"]).optional().catch(undefined),
  plan: z.string().trim().max(60).optional(),
});

export async function listMyStudents(user: Actor, raw: z.input<typeof StudentFilter>, now = new Date()) {
  const f = StudentFilter.parse(raw);
  const ep = await myProfile(user);
  if (!ep) return null;
  const { cards, fraction } = await getStudentCards(ep.id, { now, viewerUserId: user.id });
  const plans = [...new Set(cards.map((c) => c.plan).filter((p): p is string => Boolean(p)))].sort();
  const q = f.q?.toLowerCase();
  const rows = cards.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q) && !(c.role ?? "").toLowerCase().includes(q)) return false;
    if (f.plan && c.plan !== f.plan) return false;
    if (f.status === "active" && !c.active) return false;
    if (f.status === "inactive" && c.active) return false;
    if (f.status === "onboarding" && c.onboarded) return false;
    if (f.status === "below" && !(c.rag === "red" || c.rag === "amber")) return false;
    return true;
  });
  return { rows, plans, fraction, total: cards.length, filter: f };
}

// ───────────────────────────── Student overview (/work/students/[id]) ─────────────────────────────

export async function getStudentOverview(user: Actor, studentId: string, now = new Date()) {
  const { employeeProfileId } = await assertEmployeeCanAccessStudent(user, studentId);
  const tz = user.timezone ?? "UTC";
  const s = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      onboardingStep: true,
      onboardingCompletedAt: true,
      linkedinUrl: true,
      githubUrl: true,
      portfolioUrl: true,
      workAuthorization: true,
      needsSponsorship: true,
      targetTitles: true,
      seniority: true,
      industries: true,
      locations: true,
      remoteOk: true,
      workModes: true,
      employmentTypes: true,
      minSalaryMinor: true,
      salaryCurrency: true,
      willingToRelocate: true,
      noticePeriod: true,
      avoidCompanies: true,
      targetCompanies: true,
      masterProfile: true,
      user: { select: { name: true, email: true, phone: true, timezone: true } },
      market: { select: { code: true, name: true, workingDays: true } },
    },
  });
  if (!s) throw new WorkError("Student not found.");
  const { start, end } = dayRangeInTz(now, tz);
  const [sub, today, recent, interviews, totals, thread, assignment] = await Promise.all([
    getSubscriptionState(studentId),
    db.jobApplication.count({ where: { studentId, appliedAt: { gte: start, lt: end } } }),
    db.jobApplication.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, companyName: true, companyDomain: true, jobTitle: true, status: true, appliedAt: true, createdAt: true, source: true, jobUrl: true, employeeId: true },
    }),
    db.interview.findMany({
      where: { application: { studentId } },
      orderBy: { scheduledAt: "desc" },
      take: 10,
      select: { id: true, scheduledAt: true, timezone: true, round: true, mode: true, meetingLink: true, outcome: true, application: { select: { id: true, companyName: true, jobTitle: true } } },
    }),
    db.jobApplication.groupBy({ by: ["status"], where: { studentId }, _count: { _all: true } }),
    employeeProfileId ? db.messageThread.findFirst({ where: { studentId, isActive: true }, select: { id: true } }) : Promise.resolve(null),
    employeeProfileId ? db.assignment.findFirst({ where: { studentId, employeeId: employeeProfileId, isActive: true }, orderBy: { startsAt: "desc" }, select: { type: true, startsAt: true, endsAt: true } }) : Promise.resolve(null),
  ]);
  const mp = (s.masterProfile ?? null) as { summary?: string; skills?: { name?: string }[] | string[]; headline?: string } | null;
  const totalApps = totals.reduce((a, t) => a + t._count._all, 0);
  const interviewsCount = totals.filter((t) => ["INTERVIEW_SCHEDULED", "INTERVIEWING", "OFFER", "HIRED"].includes(t.status)).reduce((a, t) => a + t._count._all, 0);
  return {
    student: { ...s, masterProfile: undefined, hasMaster: Boolean(mp), headline: mp?.headline ?? null, summary: typeof mp?.summary === "string" ? mp.summary : null },
    subscription: sub,
    today: { applied: today, target: sub.active && s.market.workingDays.includes(Number(formatInTz(now, tz, "i"))) ? sub.dailyTarget : 0 },
    recent: recent.map((r) => ({ ...r, mine: r.employeeId === employeeProfileId })),
    interviews,
    totals: { applications: totalApps, interviews: interviewsCount, byStatus: Object.fromEntries(totals.map((t) => [t.status, t._count._all])) as Partial<Record<ApplicationStatus, number>> },
    threadId: thread?.id ?? null,
    assignment,
    now,
  };
}

// ───────────────────────────── My applications (/work/applications) ─────────────────────────────

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined);
export const ApplicationsFilter = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().optional().transform((v) => (v && v in STATUS_LABEL ? (v as ApplicationStatus) : undefined)),
  student: z.string().trim().max(40).optional(),
  source: z.string().optional().transform((v) => (v && (JOB_SOURCES as readonly string[]).includes(v) ? (v as JobSource) : undefined)),
  from: dateKey,
  to: dateKey,
  cursor: z.string().max(60).optional(),
});
export type ApplicationsFilterT = z.output<typeof ApplicationsFilter>;

function applicationsWhere(employeeId: string, f: ApplicationsFilterT, tz: string): Prisma.JobApplicationWhereInput {
  return {
    employeeId,
    ...(f.status ? { status: f.status } : {}),
    ...(f.student ? { studentId: f.student } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.q ? { OR: [{ companyName: { contains: f.q, mode: "insensitive" } }, { jobTitle: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(f.from || f.to
      ? { createdAt: { ...(f.from ? { gte: startOfDayInTz(f.from, tz) } : {}), ...(f.to ? { lt: startOfDayInTz(addDayKey(f.to, 1), tz) } : {}) } }
      : {}),
  };
}

export async function listMyApplications(user: Actor, raw: Record<string, string | undefined>) {
  const f = ApplicationsFilter.parse(raw);
  const ep = await myProfile(user);
  if (!ep) return null;
  const tz = ep.user.timezone;
  const where = applicationsWhere(ep.id, f, tz);
  const take = 25;
  const rows = await db.jobApplication.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    select: { id: true, companyName: true, companyDomain: true, jobTitle: true, status: true, source: true, appliedAt: true, createdAt: true, jobUrl: true, studentId: true, student: { select: { user: { select: { name: true } } } } },
  });
  const hasMore = rows.length > take;
  const page = rows.slice(0, take);
  // Students for the filter: anyone I've logged applications for.
  const studentRows = await db.jobApplication.findMany({ where: { employeeId: ep.id }, distinct: ["studentId"], select: { studentId: true, student: { select: { user: { select: { name: true } } } } } });
  const assigned = await assignedStudentIds(ep.id);
  const total = await db.jobApplication.count({ where });
  return {
    rows: page.map((r) => ({ ...r, studentName: r.student.user.name, canUpdate: assigned.has(r.studentId) || user.role !== "EMPLOYEE" })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
    total,
    students: studentRows.map((s) => ({ id: s.studentId, name: s.student.user.name })).sort((a, b) => a.name.localeCompare(b.name)),
    filter: f,
    timezone: tz,
  };
}

export async function exportMyApplications(user: Actor, raw: Record<string, string | undefined>) {
  const f = ApplicationsFilter.parse(raw);
  const ep = await myProfile(user);
  if (!ep) throw new WorkError("No employee profile.");
  const tz = ep.user.timezone;
  const rows = await db.jobApplication.findMany({
    where: applicationsWhere(ep.id, f, tz),
    orderBy: { createdAt: "desc" },
    take: 10_000,
    select: { id: true, companyName: true, jobTitle: true, status: true, source: true, location: true, appliedAt: true, createdAt: true, jobUrl: true, student: { select: { user: { select: { name: true } } } } },
  });
  const csv = Papa.unparse({
    fields: ["Applied at", "Student", "Company", "Title", "Location", "Source", "Status", "Job URL", "Application ID"],
    data: rows.map((r) => [formatInTz(r.appliedAt ?? r.createdAt, tz, "yyyy-MM-dd HH:mm"), r.student.user.name, r.companyName, r.jobTitle, r.location ?? "", r.source, STATUS_LABEL[r.status], r.jobUrl, r.id]),
  });
  return { body: Buffer.from(`﻿${csv}`, "utf8"), filename: `applications-${dayKey(new Date(), tz)}.csv` };
}

// ───────────────────────────── Interviews (/work/interviews) ─────────────────────────────

export async function listMyInterviews(user: Actor, when: "upcoming" | "past", now = new Date()) {
  const ep = await myProfile(user);
  if (!ep) return null;
  const ids = [...(await assignedStudentIds(ep.id, now)).keys()];
  const cutoff = new Date(now.getTime() - 2 * 3600e3);
  const rows = ids.length
    ? await db.interview.findMany({
        where: { application: { studentId: { in: ids } }, scheduledAt: when === "upcoming" ? { gte: cutoff } : { lt: cutoff } },
        orderBy: { scheduledAt: when === "upcoming" ? "asc" : "desc" },
        take: 100,
        select: {
          id: true,
          scheduledAt: true,
          timezone: true,
          round: true,
          mode: true,
          meetingLink: true,
          interviewers: true,
          prepNotes: true,
          outcome: true,
          application: { select: { id: true, companyName: true, companyDomain: true, jobTitle: true, status: true, studentId: true, student: { select: { user: { select: { name: true, timezone: true } } } } } },
        },
      })
    : [];
  // Applications that can get an interview (for "Add interview").
  const apps = ids.length
    ? await db.jobApplication.findMany({
        where: { studentId: { in: ids }, status: { in: ["APPLIED", "VIEWED", "RECRUITER_REPLIED", "ASSESSMENT", "INTERVIEW_SCHEDULED", "INTERVIEWING", "ON_HOLD", "NO_RESPONSE"] } },
        orderBy: { lastStatusAt: "desc" },
        take: 200,
        select: { id: true, companyName: true, jobTitle: true, status: true, student: { select: { user: { select: { name: true } } } } },
      })
    : [];
  return { rows, apps: apps.map((a) => ({ id: a.id, label: `${a.student.user.name} · ${a.companyName} — ${a.jobTitle}`, status: a.status })), timezone: ep.user.timezone };
}

// ───────────────────────────── Profile (/work/profile) ─────────────────────────────

export async function getMyWorkProfile(user: Actor) {
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { name: true, email: true, phone: true, timezone: true, role: true, totpEnabled: true, lastLoginAt: true, employee: { select: { employeeCode: true, title: true, workSchedule: true, joiningDate: true, maxStudents: true, managerId: true } } },
  });
  if (!u) throw new WorkError("Account not found.");
  const manager = u.employee?.managerId ? await db.employeeProfile.findUnique({ where: { id: u.employee.managerId }, select: { user: { select: { name: true } } } }) : null;
  return { ...u, schedule: u.employee ? parseSchedule(u.employee.workSchedule) : null, managerName: manager?.user.name ?? null };
}

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const ProfileInput = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(80),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number, e.g. +91 98765 43210.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  timezone: z.string().trim().refine(validTz, "Choose a valid time zone."),
});

export async function updateMyWorkProfile(user: Actor, raw: z.input<typeof ProfileInput>) {
  const v = ProfileInput.parse(raw);
  const before = await db.user.findUnique({ where: { id: user.id }, select: { name: true, phone: true, timezone: true } });
  await db.user.update({ where: { id: user.id }, data: { name: v.name, phone: v.phone ?? null, timezone: v.timezone } });
  await audit({ actorId: user.id, action: "profile.update", entity: "User", entityId: user.id, before, after: v });
  return v;
}

export const PasswordInput = z
  .object({
    current: z.string().min(1, "Enter your current password.").max(256),
    next: z.string().min(10, "Use at least 10 characters.").max(256),
    confirm: z.string().max(256),
  })
  .refine((v) => v.next === v.confirm, { message: "The passwords don't match.", path: ["confirm"] });

export async function changeMyPassword(user: Actor, raw: z.input<typeof PasswordInput>) {
  const v = PasswordInput.parse(raw);
  const u = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, email: true, name: true } });
  if (!u || !(await verifyPassword(u.passwordHash, v.current))) throw new WorkError("Your current password is incorrect.", "current");
  if (v.current === v.next) throw new WorkError("Choose a password you haven't used here.", "next");
  const s = passwordStrength(v.next, [u.email, u.name]);
  if (s.score < 2) throw new WorkError(s.warning || "This password is too easy to guess. Try a longer phrase.", "next");
  // Changing the password signs out every other device (D-124); the caller re-adopts the version on this one.
  const updated = await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(v.next), sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
  await audit({ actorId: user.id, action: "profile.password_changed", entity: "User", entityId: user.id });
  return { sessionVersion: updated.sessionVersion };
}
