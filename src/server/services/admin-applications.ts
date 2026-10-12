import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ApplicationStatus, JobSource } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { audit } from "./audit";

/** All applications, all students (SPEC §5 /admin/applications). */

export const PAGE_SIZE = 25;

export const appFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(ApplicationStatus).optional().catch(undefined),
  source: z.enum(JobSource).optional().catch(undefined),
  market: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  employee: z.string().trim().max(40).optional().catch(undefined),
  student: z.string().trim().max(40).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  cursor: z.string().max(64).optional().catch(undefined),
});

function buildWhere(f: z.infer<typeof appFilterSchema>): Prisma.JobApplicationWhereInput {
  return {
    ...(f.status ? { status: f.status } : { status: { not: "DRAFT" } }),
    ...(f.source ? { source: f.source } : {}),
    ...(f.market ? { student: { market: { code: f.market } } } : {}),
    ...(f.employee ? { employeeId: f.employee } : {}),
    ...(f.student ? { studentId: f.student } : {}),
    ...(f.from || f.to
      ? { appliedAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86400e3) } : {}) } }
      : {}),
    ...(f.q
      ? {
          OR: [
            { companyName: { contains: f.q, mode: "insensitive" } },
            { jobTitle: { contains: f.q, mode: "insensitive" } },
            { student: { user: { name: { contains: f.q, mode: "insensitive" } } } },
            { student: { user: { email: { contains: f.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
}

const SELECT = {
  id: true,
  companyName: true,
  jobTitle: true,
  jobUrl: true,
  location: true,
  source: true,
  status: true,
  appliedAt: true,
  lastStatusAt: true,
  resumeVersionId: true,
  studentId: true,
  student: { select: { user: { select: { name: true } }, market: { select: { code: true } } } },
  employee: { select: { id: true, user: { select: { name: true } } } },
} satisfies Prisma.JobApplicationSelect;

export async function listAllApplications(raw: Record<string, string | undefined>) {
  const f = appFilterSchema.parse(raw);
  const where = buildWhere(f);
  const rows = await db.jobApplication.findMany({
    where,
    orderBy: [{ appliedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    select: SELECT,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const [total, byStatus, markets, employees, student] = await Promise.all([
    db.jobApplication.count({ where }),
    db.jobApplication.groupBy({ by: ["status"], where: { ...where, status: undefined }, _count: { _all: true } }),
    db.market.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true } }),
    db.employeeProfile.findMany({ where: { user: { deletedAt: null } }, orderBy: { user: { name: "asc" } }, select: { id: true, user: { select: { name: true } } } }),
    f.student ? db.studentProfile.findUnique({ where: { id: f.student }, select: { user: { select: { name: true } } } }) : null,
  ]);
  return {
    filter: f,
    items: page,
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
    total,
    byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) as Partial<Record<ApplicationStatus, number>>,
    markets,
    employees: employees.map((e) => ({ id: e.id, name: e.user.name })),
    studentName: student?.user.name ?? null,
  };
}

export async function exportAllApplications(raw: Record<string, string | undefined>, actorId: string, cap = 20_000) {
  const f = appFilterSchema.parse({ ...raw, cursor: undefined });
  const rows = await db.jobApplication.findMany({ where: buildWhere(f), orderBy: [{ appliedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }], take: cap, select: SELECT });
  await audit({ actorId, action: "export.applications", entity: "JobApplication", after: { filter: f, rows: rows.length } });
  return rows;
}
