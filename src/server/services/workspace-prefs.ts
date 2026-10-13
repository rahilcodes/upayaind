import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { EMPLOYMENT_TYPES, JOB_SOURCES, WORK_MODES, normalizeCompany } from "./applications";

/**
 * Workspace defaults (F4 employee speed, D-102): the last source / work mode /
 * employment type / location an employee logged, stored in
 * `EmployeeProfile.workspacePrefs` and applied when a new application form
 * opens. Plus the global company autocomplete (name + domain by frequency).
 */

type Actor = { id: string; role: Role };

export const WorkspaceDefaults = z.object({
  source: z.enum(JOB_SOURCES).optional(),
  workMode: z.enum(WORK_MODES).nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
});
export type WorkspaceDefaultsT = z.infer<typeof WorkspaceDefaults>;

export async function getWorkspaceDefaults(userId: string): Promise<WorkspaceDefaultsT> {
  const ep = await db.employeeProfile.findUnique({ where: { userId }, select: { workspacePrefs: true } });
  const r = WorkspaceDefaults.safeParse(ep?.workspacePrefs ?? {});
  return r.success ? r.data : {};
}

/** Remember the job fields of the application just logged (called after Mark as applied / Quick log). */
export async function rememberWorkspaceDefaults(userId: string, raw: unknown) {
  const r = WorkspaceDefaults.safeParse(raw);
  if (!r.success) return;
  const prev = await getWorkspaceDefaults(userId);
  const next: WorkspaceDefaultsT = { ...prev, ...r.data };
  await db.employeeProfile.updateMany({ where: { userId }, data: { workspacePrefs: next as Prisma.InputJsonObject } });
}

export type CompanySuggestion = { name: string; domain: string | null; count: number };

/**
 * Companies this employee has logged (managers/admins: everyone's), ranked by
 * frequency, with the most common domain per company. Max 300.
 */
export async function listCompanySuggestions(user: Actor): Promise<CompanySuggestion[]> {
  let where: Prisma.JobApplicationWhereInput = {};
  if (user.role === "EMPLOYEE") {
    const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!ep) return [];
    where = { employeeId: ep.id };
  }
  const rows = await db.jobApplication.groupBy({ by: ["companyName", "companyDomain"], where: { ...where, status: { not: "DRAFT" } }, _count: { _all: true }, orderBy: { _count: { companyName: "desc" } }, take: 1000 });
  const merged = new Map<string, CompanySuggestion & { domains: Map<string, number> }>();
  for (const r of rows) {
    const k = normalizeCompany(r.companyName);
    if (!k) continue;
    const cur = merged.get(k) ?? { name: r.companyName.trim(), domain: null, count: 0, domains: new Map<string, number>() };
    cur.count += r._count._all;
    if (r.companyDomain) cur.domains.set(r.companyDomain, (cur.domains.get(r.companyDomain) ?? 0) + r._count._all);
    merged.set(k, cur);
  }
  return [...merged.values()]
    .map((c) => ({ name: c.name, domain: [...c.domains.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, count: c.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 300);
}
