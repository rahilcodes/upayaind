import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

/** Audit log viewer (SPEC §3: ADMIN; MANAGER view). Filter by entity/action/actor/date. */

export const PAGE_SIZE = 25;

export const auditFilterSchema = z.object({
  entity: z.string().trim().max(60).optional().catch(undefined),
  action: z.string().trim().max(80).optional().catch(undefined),
  actor: z.string().trim().max(40).optional().catch(undefined), // user id | "system"
  entityId: z.string().trim().max(60).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  cursor: z.string().max(64).optional().catch(undefined),
});

export async function listAudit(raw: Record<string, string | undefined>) {
  const f = auditFilterSchema.parse(raw);
  const where: Prisma.AuditLogWhereInput = {
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.actor === "system" ? { actorId: null } : f.actor ? { actorId: f.actor } : {}),
    ...(f.entityId ? { entityId: f.entityId } : {}),
    ...(f.from || f.to ? { at: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86400e3) } : {}) } } : {}),
  };
  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    select: { id: true, actorId: true, action: true, entity: true, entityId: true, before: true, after: true, ip: true, at: true },
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const actorIds = [...new Set(page.map((r) => r.actorId).filter((x): x is string => Boolean(x)))];
  const [actors, entities, staff] = await Promise.all([
    actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, role: true } }) : [],
    db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    db.user.findMany({ where: { role: { in: ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const names = new Map(actors.map((a) => [a.id, a]));
  return {
    filter: f,
    items: page.map((r) => ({ ...r, actor: r.actorId ? (names.get(r.actorId) ?? null) : null })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
    entities: entities.map((e) => e.entity),
    staff,
  };
}

export { jsonDiffPure as jsonDiff, type DiffRow } from "@/components/admin/json-diff";
