import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { SubscriptionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { audit } from "./audit";
import { invoiceFileIds } from "./billing/invoices";
import { belowTargetStudents, todayTargets } from "./admin-metrics";

/** Admin students list + Student 360° (SPEC §11). */

export const PAGE_SIZE = 25;

export const studentFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  market: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  plan: z.string().trim().max(40).optional().catch(undefined),
  status: z.union([z.enum(SubscriptionStatus), z.literal("NONE")]).optional().catch(undefined),
  employee: z.string().trim().max(40).optional().catch(undefined), // employee profile id or "none"
  onboarding: z.enum(["incomplete"]).optional().catch(undefined),
  below: z.enum(["1"]).optional().catch(undefined),
  awaiting: z.enum(["1"]).optional().catch(undefined),
  deleted: z.enum(["requested", "deleted"]).optional().catch(undefined),
  cursor: z.string().max(64).optional().catch(undefined),
});
export type StudentFilter = z.infer<typeof studentFilterSchema>;

async function buildWhere(f: StudentFilter): Promise<Prisma.StudentProfileWhereInput> {
  const and: Prisma.StudentProfileWhereInput[] = [];
  if (f.deleted === "deleted") and.push({ user: { deletedAt: { not: null } } });
  else if (f.deleted === "requested") and.push({ user: { deletedAt: null, deletionRequestedAt: { not: null } } });
  else and.push({ user: { deletedAt: null } });
  if (f.q) and.push({ user: { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }, { phone: { contains: f.q } }] } });
  if (f.market) and.push({ market: { code: f.market } });
  if (f.plan) and.push({ subscriptions: { some: { planPrice: { plan: { code: f.plan } }, status: { not: "PENDING_PAYMENT" } } } });
  if (f.status === "NONE") and.push({ subscriptions: { none: { status: { not: "PENDING_PAYMENT" } } } });
  else if (f.status) and.push({ subscriptions: { some: { status: f.status } } });
  if (f.employee === "none") and.push({ assignments: { none: { isActive: true, type: "PRIMARY" } } });
  else if (f.employee) and.push({ assignments: { some: { isActive: true, type: "PRIMARY", employeeId: f.employee } } });
  if (f.onboarding === "incomplete") and.push({ onboardingCompletedAt: null });
  if (f.awaiting) and.push({ assignmentQueue: "AWAITING" });
  if (f.below) {
    const ids = (await belowTargetStudents()).map((r) => r.studentId);
    and.push({ id: { in: ids } });
  }
  return { AND: and };
}

const ROW_SELECT = {
  id: true,
  createdAt: true,
  onboardingCompletedAt: true,
  assignmentQueue: true,
  user: { select: { name: true, email: true, deletionRequestedAt: true, deletedAt: true } },
  market: { select: { code: true } },
  subscriptions: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { status: true, currentPeriodEnd: true, planPrice: { select: { interval: true, dailyTarget: true, plan: { select: { name: true } } } } },
  },
  assignments: { where: { isActive: true, type: "PRIMARY" }, take: 1, select: { employee: { select: { id: true, user: { select: { name: true } } } } } },
  _count: { select: { applications: true } },
} satisfies Prisma.StudentProfileSelect;

type RawRow = Prisma.StudentProfileGetPayload<{ select: typeof ROW_SELECT }>;

async function decorate(rows: RawRow[]) {
  const ids = rows.map((r) => r.id);
  const [targets, interviews] = await Promise.all([
    ids.length ? todayTargets(new Date(), { studentIds: ids }) : Promise.resolve([]),
    ids.length
      ? db.$queryRaw<{ studentId: string; n: bigint }[]>`SELECT a."studentId", COUNT(i.id)::bigint AS n FROM "Interview" i JOIN "JobApplication" a ON a.id = i."applicationId" WHERE a."studentId" = ANY(${ids}) GROUP BY 1`
      : Promise.resolve([]),
  ]);
  const t = new Map(targets.map((x) => [x.studentId, x]));
  const iv = new Map(interviews.map((x) => [x.studentId, Number(x.n)]));
  return rows.map((r) => {
    const sub = r.subscriptions[0];
    const today = t.get(r.id);
    return {
      id: r.id,
      name: r.user.name,
      email: r.user.email,
      market: r.market.code,
      plan: sub?.planPrice.plan.name ?? null,
      interval: sub?.planPrice.interval ?? null,
      status: sub?.status ?? null,
      periodEnd: sub?.currentPeriodEnd ?? null,
      employeeId: r.assignments[0]?.employee.id ?? null,
      employee: r.assignments[0]?.employee.user.name ?? null,
      awaiting: r.assignmentQueue === "AWAITING",
      onboarded: Boolean(r.onboardingCompletedAt),
      today: today ? { applied: today.applied, target: today.target, rag: today.rag } : null,
      applications: r._count.applications,
      interviews: iv.get(r.id) ?? 0,
      deletionRequestedAt: r.user.deletionRequestedAt,
      deletedAt: r.user.deletedAt,
      createdAt: r.createdAt,
    };
  });
}

export async function listStudents(raw: Record<string, string | undefined>) {
  const f = studentFilterSchema.parse(raw);
  const where = await buildWhere(f);
  const rows = await db.studentProfile.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    select: ROW_SELECT,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const [items, total, options] = await Promise.all([decorate(page), db.studentProfile.count({ where }), studentFilterOptions()]);
  return { filter: f, items, total, nextCursor: hasMore ? page[page.length - 1]!.id : null, options };
}

export async function studentFilterOptions() {
  const [markets, plans, employees] = await Promise.all([
    db.market.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true } }),
    db.plan.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true } }),
    db.employeeProfile.findMany({ where: { user: { deletedAt: null, status: { not: "DEACTIVATED" } } }, orderBy: { user: { name: "asc" } }, select: { id: true, user: { select: { name: true } } } }),
  ]);
  return { markets, plans, employees: employees.map((e) => ({ id: e.id, name: e.user.name })) };
}

/** All matching rows for CSV export (capped). */
export async function exportStudents(raw: Record<string, string | undefined>, actorId: string, cap = 10_000) {
  const f = studentFilterSchema.parse({ ...raw, cursor: undefined });
  const where = await buildWhere(f);
  const rows = await db.studentProfile.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: cap, select: ROW_SELECT });
  const items = await decorate(rows);
  await audit({ actorId, action: "export.students", entity: "StudentProfile", after: { filter: f, rows: items.length } });
  return items;
}

// ─────────────────────────── Student 360° ───────────────────────────

export async function getStudent360(studentId: string) {
  const s = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
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
      consentApplyOnBehalfAt: true,
      consentTermsAt: true,
      consentVersion: true,
      assignmentQueue: true,
      awaitingSince: true,
      internalNotes: true,
      user: { select: { name: true, email: true, phone: true, timezone: true, status: true, emailVerified: true, lastLoginAt: true, createdAt: true, deletionRequestedAt: true, deletedAt: true } },
      market: { select: { id: true, code: true, name: true, locale: true } },
    },
  });
  if (!s) return null;

  const [subscriptions, payments, assignments, resumes, mocks, credentials, auditRows, threads, today] = await Promise.all([
    db.subscription.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, provider: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, createdAt: true, planPrice: { select: { interval: true, amountMinor: true, currency: true, dailyTarget: true, plan: { select: { name: true } } } } },
    }),
    db.payment.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, amountMinor: true, currency: true, status: true, invoiceNumber: true, invoiceKey: true, refundedMinor: true, paidAt: true, createdAt: true } }),
    db.assignment.findMany({
      where: { studentId },
      orderBy: { startsAt: "desc" },
      select: { id: true, type: true, source: true, isActive: true, startsAt: true, endsAt: true, endReason: true, createdById: true, employee: { select: { id: true, employeeCode: true, user: { select: { name: true } } } } },
    }),
    db.resumeVersion.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, kind: true, title: true, atsScore: true, createdAt: true, lockedAt: true, styleCode: true } }),
    db.mockInterview.findMany({ where: { studentId }, orderBy: { scheduledAt: "desc" }, select: { id: true, scheduledAt: true, status: true, focus: true, scores: true, feedback: true, conductedById: true } }),
    db.credential.findMany({
      where: { studentId },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, label: true, createdAt: true, updatedAt: true, deletedAt: true, accessLogs: { orderBy: { at: "desc" }, take: 50, select: { id: true, userId: true, action: true, at: true, ip: true } } },
    }),
    db.auditLog.findMany({
      where: { OR: [{ entityId: studentId }, { entityId: s.userId }, { after: { path: ["studentId"], equals: studentId } }] },
      orderBy: { at: "desc" },
      take: 50,
      select: { id: true, action: true, entity: true, entityId: true, actorId: true, at: true, before: true, after: true },
    }),
    db.messageThread.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, select: { id: true, isActive: true, employee: { select: { user: { select: { name: true } } } }, _count: { select: { messages: true } } } }),
    todayTargets(new Date(), { studentIds: [studentId] }),
  ]);

  const files = await invoiceFileIds(payments.map((p) => p.invoiceKey));
  const userIds = [...new Set([...credentials.flatMap((c) => c.accessLogs.map((l) => l.userId)), ...auditRows.map((a) => a.actorId).filter((x): x is string => Boolean(x)), ...assignments.map((a) => a.createdById).filter((x): x is string => Boolean(x))])];
  const empIds = [...new Set(mocks.map((m) => m.conductedById))];
  const [people, mockEmps] = await Promise.all([
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true } }) : [],
    // conductedById is an EmployeeProfile id (older seed rows may hold a User id).
    empIds.length ? db.employeeProfile.findMany({ where: { OR: [{ id: { in: empIds } }, { userId: { in: empIds } }] }, select: { id: true, userId: true, user: { select: { name: true } } } }) : [],
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const mockNames = new Map(mockEmps.flatMap((m) => [[m.id, m.user.name] as const, [m.userId, m.user.name] as const]));

  return {
    ...s,
    today: today[0] ?? null,
    subscriptions,
    payments: payments.map(({ invoiceKey, ...p }) => ({ ...p, fileId: invoiceKey ? (files.get(invoiceKey) ?? null) : null })),
    assignments: assignments.map((a) => ({ ...a, createdByName: a.createdById ? (names.get(a.createdById) ?? null) : null })),
    resumes,
    mocks: mocks.map((m) => ({ ...m, conductedBy: mockNames.get(m.conductedById) ?? null })),
    credentials: credentials.map((c) => ({ ...c, accessLogs: c.accessLogs.map((l) => ({ ...l, userName: names.get(l.userId) ?? null })) })),
    audit: auditRows.map((a) => ({ ...a, actorName: a.actorId ? (names.get(a.actorId) ?? null) : null })),
    threads: threads.map((t) => ({ id: t.id, isActive: t.isActive, employeeName: t.employee.user.name, count: t._count.messages })),
  };
}

/** Applications tab for Student 360 (paged, newest first). */
export async function studentApplications(studentId: string, cursor?: string) {
  const rows = await db.jobApplication.findMany({
    where: { studentId },
    orderBy: [{ appliedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, companyName: true, jobTitle: true, jobUrl: true, status: true, appliedAt: true, resumeVersionId: true, employee: { select: { user: { select: { name: true } } } } },
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

// ─────────────────────────── Mutations ───────────────────────────

export const notesSchema = z.object({ studentId: z.string().min(1), notes: z.string().max(10_000, "Keep notes under 10,000 characters.") });

export async function saveInternalNotes(actorId: string, raw: z.input<typeof notesSchema>) {
  const input = notesSchema.parse(raw);
  const before = await db.studentProfile.findUnique({ where: { id: input.studentId }, select: { internalNotes: true } });
  if (!before) throw new UserError("Student not found.");
  const notes = input.notes.trim() || null;
  await db.studentProfile.update({ where: { id: input.studentId }, data: { internalNotes: notes } });
  await audit({ actorId, action: "student.notes", entity: "StudentProfile", entityId: input.studentId, before: { internalNotes: before.internalNotes }, after: { internalNotes: notes } });
  return { ok: true };
}

export const DELETION_GRACE_DAYS = 30;

/**
 * Confirm a deletion request (SPEC §10): 30-day soft delete. Sets
 * User.deletedAt + DEACTIVATED, ends active assignments and deactivates threads.
 * The nightly purge (jobs/maintenance) anonymises the account after 30 days.
 */
export async function confirmDeletion(actorId: string, studentId: string, note: string) {
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true, user: { select: { deletedAt: true, deletionRequestedAt: true, status: true } } } });
  if (!s) throw new UserError("Student not found.");
  if (s.user.deletedAt) throw new UserError("This account is already scheduled for deletion.");
  const now = new Date();
  const ended = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: s.userId }, data: { deletedAt: now, status: "DEACTIVATED", deletionRequestedAt: s.user.deletionRequestedAt ?? now } });
    const r = await tx.assignment.updateMany({ where: { studentId, isActive: true }, data: { isActive: false, endsAt: now, endReason: "Account deleted" } });
    await tx.messageThread.updateMany({ where: { studentId, isActive: true }, data: { isActive: false } });
    await tx.studentProfile.update({ where: { id: studentId }, data: { assignmentQueue: null, awaitingSince: null } });
    await tx.authToken.updateMany({ where: { userId: s.userId, consumedAt: null }, data: { consumedAt: now } });
    await audit({ actorId, action: "student.deletion_confirmed", entity: "StudentProfile", entityId: studentId, before: { status: s.user.status }, after: { deletedAt: now, purgeAfter: new Date(now.getTime() + DELETION_GRACE_DAYS * 86400e3), note } }, tx);
    return r.count;
  });
  return { assignmentsEnded: ended };
}

/** Dismiss a pending deletion request (e.g. the student changed their mind). */
export async function dismissDeletionRequest(actorId: string, studentId: string, note: string) {
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true, user: { select: { deletedAt: true, deletionRequestedAt: true } } } });
  if (!s) throw new UserError("Student not found.");
  if (s.user.deletedAt) throw new UserError("This account is already scheduled for deletion. Restore it instead.");
  if (!s.user.deletionRequestedAt) throw new UserError("There's no pending deletion request.");
  await db.user.update({ where: { id: s.userId }, data: { deletionRequestedAt: null } });
  await audit({ actorId, action: "student.deletion_dismissed", entity: "StudentProfile", entityId: studentId, before: { deletionRequestedAt: s.user.deletionRequestedAt }, after: { note } });
  return { ok: true };
}

/** Undo a soft delete within the 30-day window (account comes back deactivated → active). */
export async function restoreDeletedStudent(actorId: string, studentId: string) {
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true, user: { select: { deletedAt: true, email: true } } } });
  if (!s) throw new UserError("Student not found.");
  if (!s.user.deletedAt) throw new UserError("This account isn't deleted.");
  if (s.user.email.endsWith("@deleted.invalid")) throw new UserError("This account has already been purged and can't be restored.");
  await db.user.update({ where: { id: s.userId }, data: { deletedAt: null, deletionRequestedAt: null, status: "ACTIVE" } });
  await audit({ actorId, action: "student.deletion_restored", entity: "StudentProfile", entityId: studentId });
  return { ok: true };
}

/** Employees for the reassign dialog: load/max and whether they serve the student's market. */
export async function reassignOptions(studentId: string) {
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { marketId: true } });
  if (!s) return [];
  const emps = await db.employeeProfile.findMany({
    where: { user: { status: "ACTIVE", deletedAt: null } },
    orderBy: { user: { name: "asc" } },
    select: { id: true, employeeCode: true, maxStudents: true, marketIds: true, acceptingNewStudents: true, user: { select: { name: true } }, _count: { select: { assignments: { where: { isActive: true, type: "PRIMARY" } } } } },
  });
  return emps
    .filter((e) => e.marketIds.includes(s.marketId))
    .map((e) => ({ id: e.id, code: e.employeeCode, name: e.user.name, active: e._count.assignments, max: e.maxStudents, accepting: e.acceptingNewStudents }));
}
