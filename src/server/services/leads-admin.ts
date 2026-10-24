import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { audit } from "./audit";

/** Leads inbox (SPEC §11 / §5 /admin/leads): contact form, chatbot, call bookings. */

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const PAGE_SIZE = 25;

export const leadFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(LEAD_STATUSES).optional().catch(undefined),
  owner: z.string().trim().max(40).optional().catch(undefined), // user id | "none" | "me"
  source: z.string().trim().max(40).optional().catch(undefined),
  market: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  due: z.enum(["1"]).optional().catch(undefined), // follow-up due today or overdue
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  cursor: z.string().max(64).optional().catch(undefined),
});

function buildWhere(f: z.infer<typeof leadFilterSchema>, viewerId: string): Prisma.LeadWhereInput {
  return {
    ...(f.status ? { status: f.status } : {}),
    ...(f.owner === "none" ? { ownerId: null } : f.owner === "me" ? { ownerId: viewerId } : f.owner ? { ownerId: f.owner } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.market ? { marketCode: f.market } : {}),
    ...(f.due ? { nextFollowUpAt: { lte: new Date(Date.now() + 86400e3) }, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } : {}),
    ...(f.from || f.to
      ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86400e3) } : {}) } }
      : {}),
    ...(f.q
      ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }, { phone: { contains: f.q } }, { message: { contains: f.q, mode: "insensitive" } }] }
      : {}),
  };
}

const LEAD_SELECT = { id: true, name: true, email: true, phone: true, marketCode: true, source: true, message: true, status: true, ownerId: true, nextFollowUpAt: true, utm: true, createdAt: true } satisfies Prisma.LeadSelect;

export async function listLeads(raw: Record<string, string | undefined>, viewerId: string) {
  const f = leadFilterSchema.parse(raw);
  const where = buildWhere(f, viewerId);
  const rows = await db.lead.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE_SIZE + 1, ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}), select: LEAD_SELECT });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const [counts, sources, owners, notes] = await Promise.all([
    db.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    db.lead.findMany({ distinct: ["source"], select: { source: true }, orderBy: { source: "asc" } }),
    db.user.findMany({ where: { role: { in: ["MANAGER", "TEAM_LEAD", "ADMIN"] }, status: "ACTIVE", deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    leadNotes(page.map((p) => p.id)),
  ]);
  return {
    filter: f,
    items: page.map((l) => ({ ...l, notes: notes.get(l.id) ?? [] })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number>,
    sources: sources.map((s) => s.source),
    owners,
  };
}

/** Notes are stored as audit entries (`lead.note`) — append-only and attributed. */
async function leadNotes(ids: string[]) {
  const out = new Map<string, { at: Date; by: string | null; text: string }[]>();
  if (!ids.length) return out;
  const rows = await db.auditLog.findMany({ where: { entity: "Lead", action: "lead.note", entityId: { in: ids } }, orderBy: { at: "desc" }, select: { entityId: true, at: true, actorId: true, after: true } });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))];
  const names = new Map((actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  for (const r of rows) {
    const text = (r.after as { text?: string } | null)?.text ?? "";
    out.set(r.entityId!, [...(out.get(r.entityId!) ?? []), { at: r.at, by: r.actorId ? (names.get(r.actorId) ?? null) : null, text }]);
  }
  return out;
}

export const leadUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(LEAD_STATUSES),
  ownerId: z.string().min(1).nullable(),
  nextFollowUpAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
    .nullable()
    .or(z.literal("").transform(() => null)),
  note: z.string().trim().max(2000).optional().nullable(),
});

export async function updateLead(actorId: string, raw: z.input<typeof leadUpdateSchema>) {
  const input = leadUpdateSchema.parse(raw);
  const before = await db.lead.findUnique({ where: { id: input.id }, select: { status: true, ownerId: true, nextFollowUpAt: true } });
  if (!before) throw new UserError("Lead not found.");
  if (input.ownerId) {
    const o = await db.user.findFirst({ where: { id: input.ownerId, role: { in: ["MANAGER", "TEAM_LEAD", "ADMIN"] }, deletedAt: null }, select: { id: true } });
    if (!o) throw new UserError("Pick a manager or admin as owner.", "ownerId");
  }
  const next = input.nextFollowUpAt ? new Date(`${input.nextFollowUpAt}T09:00:00Z`) : null;
  await db.lead.update({ where: { id: input.id }, data: { status: input.status, ownerId: input.ownerId, nextFollowUpAt: next } });
  const changed = before.status !== input.status || before.ownerId !== input.ownerId || (before.nextFollowUpAt?.getTime() ?? null) !== (next?.getTime() ?? null);
  if (changed) await audit({ actorId, action: "lead.update", entity: "Lead", entityId: input.id, before, after: { status: input.status, ownerId: input.ownerId, nextFollowUpAt: next } });
  if (input.note) await audit({ actorId, action: "lead.note", entity: "Lead", entityId: input.id, after: { text: input.note } });
  return { ok: true };
}

export async function exportLeads(raw: Record<string, string | undefined>, viewerId: string, cap = 10_000) {
  const f = leadFilterSchema.parse({ ...raw, cursor: undefined });
  const rows = await db.lead.findMany({ where: buildWhere(f, viewerId), orderBy: { createdAt: "desc" }, take: cap, select: LEAD_SELECT });
  const owners = new Map((await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.ownerId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  await audit({ actorId: viewerId, action: "export.leads", entity: "Lead", after: { filter: f, rows: rows.length } });
  return rows.map((r) => ({ ...r, ownerName: r.ownerId ? (owners.get(r.ownerId) ?? "") : "" }));
}
