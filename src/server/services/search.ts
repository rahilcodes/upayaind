import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { isManagerial } from "@/server/auth/rbac";
import { ForbiddenError } from "@/server/auth/access";

/**
 * ⌘K command palette search (D-125). Role-aware:
 * - EMPLOYEE: students with an active assignment (primary or cover window) and
 *   their applications; no employee results.
 * - MANAGER / ADMIN: every student, employee and application.
 * At most 8 results per group; the query must be ≥ 2 characters.
 */

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_GROUP_LIMIT = 8;

export type SearchHit = { id: string; title: string; subtitle: string | null; href: string };
export type SearchResults = { students: SearchHit[]; employees: SearchHit[]; applications: SearchHit[] };

type Actor = { id: string; role: Role };

function normalise(q: string) {
  return q.trim().replace(/\s+/g, " ").slice(0, 80);
}

/** Student ids an employee may see right now (active PRIMARY, or COVER inside its window). */
async function visibleStudentIds(employeeUserId: string): Promise<string[] | null> {
  const ep = await db.employeeProfile.findUnique({ where: { userId: employeeUserId }, select: { id: true } });
  if (!ep) return [];
  const now = new Date();
  const rows = await db.assignment.findMany({
    where: { employeeId: ep.id, isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { studentId: true },
  });
  return [...new Set(rows.map((r) => r.studentId))];
}

export async function searchAll(actor: Actor, rawQuery: string): Promise<SearchResults> {
  const q = normalise(rawQuery);
  const empty: SearchResults = { students: [], employees: [], applications: [] };
  if (q.length < SEARCH_MIN_CHARS) return empty;
  if (actor.role === "STUDENT") throw new ForbiddenError();
  const staffWide = isManagerial(actor.role);
  const portal = staffWide ? "/admin" : "/work";
  const scope = staffWide ? null : await visibleStudentIds(actor.id);
  if (scope && !scope.length) return empty;

  const text = { contains: q, mode: "insensitive" as const };

  const [students, employees, applications] = await Promise.all([
    db.studentProfile.findMany({
      where: {
        ...(scope ? { id: { in: scope } } : {}),
        user: { deletedAt: null, OR: [{ name: text }, { email: text }] },
      },
      take: SEARCH_GROUP_LIMIT,
      orderBy: { user: { name: "asc" } },
      select: { id: true, user: { select: { name: true, email: true } }, market: { select: { code: true } } },
    }),
    staffWide
      ? db.employeeProfile.findMany({
          where: { user: { deletedAt: null, role: { in: ["EMPLOYEE", "MANAGER"] }, OR: [{ name: text }, { email: text }] } },
          take: SEARCH_GROUP_LIMIT,
          orderBy: { user: { name: "asc" } },
          select: { id: true, employeeCode: true, user: { select: { name: true, email: true, status: true } } },
        })
      : Promise.resolve([]),
    db.jobApplication.findMany({
      where: {
        ...(scope ? { studentId: { in: scope } } : {}),
        OR: [{ companyName: text }, { jobTitle: text }],
      },
      take: SEARCH_GROUP_LIMIT,
      orderBy: { createdAt: "desc" },
      select: { id: true, companyName: true, jobTitle: true, status: true, studentId: true, student: { select: { user: { select: { name: true } } } } },
    }),
  ]);

  return {
    students: students.map((s) => ({ id: s.id, title: s.user.name, subtitle: `${s.user.email} · ${s.market.code}`, href: `${portal}/students/${s.id}` })),
    employees: employees.map((e) => ({ id: e.id, title: e.user.name, subtitle: `${e.employeeCode} · ${e.user.email}${e.user.status !== "ACTIVE" ? ` · ${e.user.status.toLowerCase()}` : ""}`, href: `/admin/employees/${e.id}` })),
    applications: applications.map((a) => ({
      id: a.id,
      title: `${a.jobTitle} · ${a.companyName}`,
      subtitle: `${a.student.user.name} · ${a.status.replace(/_/g, " ").toLowerCase()}`,
      href: staffWide ? `/admin/applications?student=${a.studentId}&q=${encodeURIComponent(a.companyName)}` : `/work/applications?highlight=${a.id}`,
    })),
  };
}
