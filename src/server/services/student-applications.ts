import "server-only";
import { z } from "zod";
import type { ApplicationStatus, Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { addDayKey, startOfDayInTz } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { firstName } from "@/lib/utils";
import { getTimeline, listInterviews, STATUS_LABEL, WORK_MODES, JOB_SOURCES } from "./applications";
import { getOrCreateBaseVersion, parseMaster } from "./resumes";

/**
 * Student-facing reads for /app/applications, /app/companies, /app/interviews
 * and /app/resumes (SPEC F6). Every function resolves the student from the
 * acting user — a student can never read another student's rows.
 */

type Actor = { id: string; role: Role; timezone?: string };

export const PAGE_SIZE = 25;
const STATUSES = Object.keys(STATUS_LABEL) as ApplicationStatus[];

async function ownStudent(user: Actor) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true, user: { select: { timezone: true, name: true } } } });
  if (!s) throw new ForbiddenError();
  return { studentId: s.id, tz: s.user.timezone, name: s.user.name };
}

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);

export const ApplicationFilters = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z.enum(STATUSES as [ApplicationStatus, ...ApplicationStatus[]]).optional().catch(undefined),
  from: dateKey,
  to: dateKey,
  company: z.string().trim().max(200).optional().catch(undefined),
  source: z.enum(JOB_SOURCES).optional().catch(undefined),
  mode: z.enum(WORK_MODES).optional().catch(undefined),
  after: z.string().max(40).optional().catch(undefined),
  before: z.string().max(40).optional().catch(undefined),
});
export type ApplicationFiltersT = z.infer<typeof ApplicationFilters>;

/** Pure: Prisma where for the student's filters (dates are calendar days in `tz`). */
export function buildApplicationWhere(studentId: string, f: ApplicationFiltersT, tz: string): Prisma.JobApplicationWhereInput {
  const and: Prisma.JobApplicationWhereInput[] = [{ studentId }, { status: { not: "DRAFT" } }];
  if (f.status) and.push({ status: f.status });
  if (f.source) and.push({ source: f.source });
  if (f.mode) and.push({ workMode: f.mode });
  if (f.company) and.push({ companyName: { equals: f.company, mode: "insensitive" } });
  if (f.from) and.push({ appliedAt: { gte: startOfDayInTz(f.from, tz) } });
  if (f.to) and.push({ appliedAt: { lt: startOfDayInTz(addDayKey(f.to, 1), tz) } });
  if (f.q) {
    const q = f.q;
    and.push({ OR: [{ companyName: { contains: q, mode: "insensitive" } }, { jobTitle: { contains: q, mode: "insensitive" } }, { location: { contains: q, mode: "insensitive" } }] });
  }
  return { AND: and };
}

const LIST_SELECT = {
  id: true,
  companyName: true,
  companyDomain: true,
  jobTitle: true,
  jobUrl: true,
  location: true,
  workMode: true,
  source: true,
  status: true,
  appliedAt: true,
  resumeVersionId: true,
} satisfies Prisma.JobApplicationSelect;

const ORDER: Prisma.JobApplicationOrderByWithRelationInput[] = [{ appliedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];

/** Cursor-paginated list (25/page). `after` = next page after that id; `before` = previous page. */
export async function listStudentApplications(user: Actor, raw: Record<string, string | undefined>) {
  const { studentId, tz } = await ownStudent(user);
  const f = ApplicationFilters.parse(raw);
  const where = buildApplicationWhere(studentId, f, tz);
  const cursorId = f.before ?? f.after;
  // Only accept cursors that belong to this student.
  const validCursor = cursorId ? await db.jobApplication.findFirst({ where: { id: cursorId, studentId }, select: { id: true } }) : null;
  const backwards = Boolean(f.before && validCursor);
  const rows = await db.jobApplication.findMany({
    where,
    orderBy: ORDER,
    select: LIST_SELECT,
    ...(validCursor ? { cursor: { id: validCursor.id }, skip: 1 } : {}),
    take: backwards ? -(PAGE_SIZE + 1) : PAGE_SIZE + 1,
  });
  let items = rows;
  let hasMoreInDirection = false;
  if (rows.length > PAGE_SIZE) {
    hasMoreInDirection = true;
    items = backwards ? rows.slice(1) : rows.slice(0, PAGE_SIZE);
  }
  const total = await db.jobApplication.count({ where });
  return {
    items,
    total,
    nextCursor: backwards ? (items.length ? items[items.length - 1]!.id : null) : hasMoreInDirection ? items[items.length - 1]!.id : null,
    prevCursor: backwards ? (hasMoreInDirection ? items[0]!.id : null) : validCursor && items.length ? items[0]!.id : null,
    filters: f,
    timezone: tz,
  };
}

/** Distinct companies for the filter dropdown. */
export async function listStudentCompanyNames(user: Actor) {
  const { studentId } = await ownStudent(user);
  const rows = await db.jobApplication.findMany({ where: { studentId, status: { not: "DRAFT" } }, distinct: ["companyName"], orderBy: { companyName: "asc" }, select: { companyName: true }, take: 500 });
  return rows.map((r) => r.companyName);
}

/** CSV export of the filtered list (max 10,000 rows). Dates in the student's time zone. */
export async function exportApplicationsCsv(user: Actor, raw: Record<string, string | undefined>, appUrl: string) {
  const { studentId, tz } = await ownStudent(user);
  const f = ApplicationFilters.parse(raw);
  const rows = await db.jobApplication.findMany({ where: buildApplicationWhere(studentId, f, tz), orderBy: ORDER, take: 10_000, select: LIST_SELECT });
  const header = ["applied_at", "company", "job_title", "location", "work_mode", "source", "status", "job_url", "resume_pdf"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.appliedAt ? formatInTz(r.appliedAt, tz, "yyyy-MM-dd HH:mm") : "",
        r.companyName,
        r.jobTitle,
        r.location ?? "",
        r.workMode ?? "",
        r.source,
        STATUS_LABEL[r.status],
        r.jobUrl,
        r.resumeVersionId ? `${appUrl}/api/resumes/${r.resumeVersionId}/pdf` : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** RFC 4180 cell; also neutralises spreadsheet formula injection (=, +, -, @). */
export function csvCell(v: string) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Detail page: JD, resume used, cover letter, proof, timeline, interviews. */
export async function getStudentApplication(user: Actor, applicationId: string) {
  const { studentId, tz } = await ownStudent(user);
  const a = await db.jobApplication.findFirst({
    where: { id: applicationId, studentId, status: { not: "DRAFT" } },
    select: {
      ...LIST_SELECT,
      employmentType: true,
      jdText: true,
      salaryText: true,
      coverLetter: true,
      proofKey: true,
      proofText: true,
      createdAt: true,
      employee: { select: { user: { select: { name: true } } } },
      resumeVersion: { select: { id: true, title: true, kind: true, createdAt: true, coverLetter: true } },
    },
  });
  if (!a) return null;
  const [timeline, interviews, proofFile] = await Promise.all([
    getTimeline(user, a.id),
    listInterviews(user, a.id),
    a.proofKey ? db.fileObject.findUnique({ where: { key: a.proofKey }, select: { id: true, mime: true } }) : null,
  ]);
  const { employee, proofKey: _pk, ...rest } = a;
  void _pk;
  return {
    ...rest,
    specialistFirstName: firstName(employee.user.name),
    coverLetter: a.coverLetter ?? a.resumeVersion?.coverLetter ?? null,
    proofFile,
    timeline,
    interviews,
    timezone: tz,
  };
}

// ─────────────────────────── Companies ───────────────────────────

/** Applications grouped by company: count, latest status, latest date (offset pages of 25). */
export async function listStudentCompanies(user: Actor, opts: { q?: string; page?: number } = {}) {
  const { studentId } = await ownStudent(user);
  const page = Math.max(1, Math.min(1000, Math.floor(opts.page ?? 1)));
  const where: Prisma.JobApplicationWhereInput = { studentId, status: { not: "DRAFT" }, ...(opts.q ? { companyName: { contains: opts.q.slice(0, 120), mode: "insensitive" } } : {}) };
  const groups = await db.jobApplication.groupBy({
    by: ["companyName"],
    where,
    _count: { _all: true },
    _max: { appliedAt: true },
    orderBy: [{ _max: { appliedAt: "desc" } }, { companyName: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  const pageGroups = groups.slice(0, PAGE_SIZE);
  const names = pageGroups.map((g) => g.companyName);
  const apps = names.length
    ? await db.jobApplication.findMany({
        where: { studentId, status: { not: "DRAFT" }, companyName: { in: names } },
        orderBy: ORDER,
        select: { id: true, companyName: true, companyDomain: true, jobTitle: true, status: true, appliedAt: true },
      })
    : [];
  const byCompany = new Map<string, typeof apps>();
  for (const a of apps) byCompany.set(a.companyName, [...(byCompany.get(a.companyName) ?? []), a]);
  const totalCompanies = (await db.jobApplication.groupBy({ by: ["companyName"], where })).length;
  return {
    page,
    hasNext: groups.length > PAGE_SIZE,
    totalCompanies,
    companies: pageGroups.map((g) => {
      const list = byCompany.get(g.companyName) ?? [];
      const latest = list[0];
      return {
        companyName: g.companyName,
        domain: list.find((x) => x.companyDomain)?.companyDomain ?? null,
        count: g._count._all,
        lastAppliedAt: g._max.appliedAt,
        latestStatus: latest?.status ?? ("APPLIED" as ApplicationStatus),
        roles: list.slice(0, 5).map((x) => ({ id: x.id, jobTitle: x.jobTitle, status: x.status, appliedAt: x.appliedAt })),
        moreRoles: Math.max(0, list.length - 5),
      };
    }),
  };
}

// ─────────────────────────── Interviews ───────────────────────────

const INTERVIEW_SELECT = {
  id: true,
  scheduledAt: true,
  timezone: true,
  round: true,
  mode: true,
  meetingLink: true,
  interviewers: true,
  prepNotes: true,
  outcome: true,
  application: { select: { id: true, companyName: true, companyDomain: true, jobTitle: true, status: true } },
} satisfies Prisma.InterviewSelect;

export async function listStudentInterviews(user: Actor, now = new Date()) {
  const { studentId, tz } = await ownStudent(user);
  const cutoff = new Date(now.getTime() - 60 * 60e3);
  const [upcoming, past] = await Promise.all([
    db.interview.findMany({ where: { application: { studentId }, scheduledAt: { gte: cutoff } }, orderBy: { scheduledAt: "asc" }, take: 100, select: INTERVIEW_SELECT }),
    db.interview.findMany({ where: { application: { studentId }, scheduledAt: { lt: cutoff } }, orderBy: { scheduledAt: "desc" }, take: 100, select: INTERVIEW_SELECT }),
  ]);
  return { upcoming, past, timezone: tz };
}

/** One interview for the .ics route (owner only). */
export async function getStudentInterview(user: Actor, interviewId: string) {
  const { studentId } = await ownStudent(user);
  return db.interview.findFirst({ where: { id: interviewId, application: { studentId } }, select: INTERVIEW_SELECT });
}

// ─────────────────────────── Resumes ───────────────────────────

/**
 * /app/resumes: master profile summary, base resume (created from the master
 * profile on demand), the original upload(s) and every tailored version that
 * was used for an application, grouped by job.
 */
export async function getStudentResumes(user: Actor) {
  const { studentId } = await ownStudent(user);
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { masterProfile: true } });
  const { master } = parseMaster(s?.masterProfile);
  let base: { id: string; title: string; createdAt: Date } | null = null;
  if (master) {
    const b = await getOrCreateBaseVersion(user, studentId);
    base = await db.resumeVersion.findUnique({ where: { id: b.id }, select: { id: true, title: true, createdAt: true } });
  }
  const [uploads, tailored] = await Promise.all([
    db.fileObject.findMany({ where: { studentId, purpose: "resume", key: { contains: "/uploads/" } }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, filename: true, createdAt: true, size: true } }),
    db.resumeVersion.findMany({
      where: { studentId, kind: "TAILORED", applications: { some: { status: { not: "DRAFT" } } } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        title: true,
        createdAt: true,
        applications: { where: { status: { not: "DRAFT" } }, select: { id: true, companyName: true, companyDomain: true, jobTitle: true, appliedAt: true, status: true }, orderBy: { appliedAt: "desc" } },
      },
    }),
  ]);
  // Group by job (company + title): one group per job, every version listed.
  const groups = new Map<string, { key: string; companyName: string; companyDomain: string | null; jobTitle: string; applicationId: string; status: ApplicationStatus; appliedAt: Date | null; versions: { id: string; title: string; createdAt: Date }[] }>();
  for (const v of tailored) {
    for (const a of v.applications) {
      const key = `${a.companyName.toLowerCase()}|${a.jobTitle.toLowerCase()}`;
      const g = groups.get(key) ?? { key, companyName: a.companyName, companyDomain: a.companyDomain, jobTitle: a.jobTitle, applicationId: a.id, status: a.status, appliedAt: a.appliedAt, versions: [] };
      if (!g.versions.some((x) => x.id === v.id)) g.versions.push({ id: v.id, title: v.title, createdAt: v.createdAt });
      groups.set(key, g);
    }
  }
  return {
    studentId,
    master: master
      ? {
          name: master.basics.name,
          headline: master.basics.headline ?? null,
          experience: master.experience.length,
          skills: master.skills.reduce((n, g) => n + g.items.length, 0),
          education: master.education.length,
          projects: master.projects.length,
          latestRole: master.experience[0] ? `${master.experience[0].title} · ${master.experience[0].company}` : null,
        }
      : null,
    base,
    uploads,
    jobs: [...groups.values()].sort((a, b) => (b.appliedAt?.getTime() ?? 0) - (a.appliedAt?.getTime() ?? 0)),
  };
}
