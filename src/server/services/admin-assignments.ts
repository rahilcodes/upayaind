import "server-only";
import { db } from "@/server/db";
import { audit } from "./audit";
import { loadBoard } from "./assignment";
import { getSettings, setSetting } from "./settings";
import { generalSettingsSchema } from "./admin-settings";

/** Data for /admin/assignments (M3 UI): queue, load board, recent changes, rules, covers. */
export async function getAssignmentsPage(now = new Date()) {
  const [queue, board, recent, covers, settings, markets] = await Promise.all([
    db.studentProfile.findMany({
      where: { assignmentQueue: "AWAITING", user: { deletedAt: null } },
      orderBy: [{ awaitingSince: "asc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        awaitingSince: true,
        marketId: true,
        user: { select: { name: true, email: true } },
        market: { select: { code: true } },
        subscriptions: { where: { status: "ACTIVE" }, take: 1, select: { planPrice: { select: { plan: { select: { name: true } } } } } },
      },
    }),
    loadBoard(),
    db.assignment.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, type: true, source: true, isActive: true, startsAt: true, endsAt: true, endReason: true, createdAt: true, createdById: true, student: { select: { id: true, user: { select: { name: true } } } }, employee: { select: { id: true, user: { select: { name: true } } } } },
    }),
    db.assignment.findMany({
      where: { type: "COVER", OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      orderBy: { startsAt: "asc" },
      take: 100,
      select: { id: true, startsAt: true, endsAt: true, isActive: true, student: { select: { id: true, user: { select: { name: true } } } }, employee: { select: { id: true, user: { select: { name: true } } } } },
    }),
    getSettings(),
    db.market.findMany({ select: { id: true, code: true } }),
  ]);
  const actorIds = [...new Set(recent.map((r) => r.createdById).filter((x): x is string => Boolean(x)))];
  const actors = new Map((actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const marketCode = new Map(markets.map((m) => [m.id, m.code]));
  return {
    queue: queue.map((q) => ({ id: q.id, name: q.user.name, email: q.user.email, marketId: q.marketId, market: q.market.code, plan: q.subscriptions[0]?.planPrice.plan.name ?? null, since: q.awaitingSince })),
    board: board.map((b) => ({ ...b, markets: b.marketIds.map((id) => marketCode.get(id) ?? "?") })),
    recent: recent.map((r) => ({ ...r, createdByName: r.createdById ? (actors.get(r.createdById) ?? null) : null })),
    covers,
    rules: { autoAssignEnabled: settings.autoAssignEnabled, defaultMaxStudents: settings.defaultMaxStudents },
  };
}

const rulesSchema = generalSettingsSchema.pick({ autoAssignEnabled: true, defaultMaxStudents: true });

export async function saveAssignmentRules(actorId: string, raw: { autoAssignEnabled: boolean; defaultMaxStudents: number }) {
  const input = rulesSchema.parse(raw);
  const before = await getSettings();
  await setSetting("autoAssignEnabled", input.autoAssignEnabled);
  await setSetting("defaultMaxStudents", input.defaultMaxStudents);
  await audit({ actorId, action: "settings.assignment_rules", entity: "Setting", entityId: "autoAssignEnabled,defaultMaxStudents", before: { autoAssignEnabled: before.autoAssignEnabled, defaultMaxStudents: before.defaultMaxStudents }, after: input });
  return input;
}

/** End a cover assignment early. */
export async function endCover(actorId: string, assignmentId: string) {
  const a = await db.assignment.findUnique({ where: { id: assignmentId }, select: { type: true, isActive: true } });
  if (!a || a.type !== "COVER" || !a.isActive) return { ok: false };
  const now = new Date();
  await db.assignment.update({ where: { id: assignmentId }, data: { isActive: false, endsAt: now, endReason: "Cover ended early" } });
  await audit({ actorId, action: "assignment.cover_end", entity: "Assignment", entityId: assignmentId, after: { endsAt: now } });
  return { ok: true };
}
