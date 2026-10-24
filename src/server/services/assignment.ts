import "server-only";
import { z } from "zod";
import { db, Prisma, type Tx } from "@/server/db";
import { addDayKey, dateOnly, dayKey, keyFromDateOnly, startOfDayInTz } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { firstName } from "@/lib/utils";
import { log } from "@/server/log";
import { audit } from "./audit";
import { notify, notifyManagers } from "./notify";
import { sendAlert } from "./alerts";
import { getSetting } from "./settings";

/**
 * Assignment engine (SPEC F2).
 *
 * candidates = ACTIVE employees accepting new students, serving the student's
 * market, not on approved leave today, below maxStudents.
 * pick: fewest active → fewest assigned in 7 days → oldest lastAssignedAt → random.
 *
 * Concurrency: candidate employee rows are locked with SELECT … FOR UPDATE (in id
 * order, so concurrent transactions never deadlock) and loads are re-counted
 * inside the lock, so simultaneous payments can't overfill an employee.
 */

export class AssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssignmentError";
  }
}

export type AssignResult =
  | { status: "ASSIGNED"; assignmentId: string; employeeId: string }
  | { status: "ALREADY_ASSIGNED"; assignmentId: string; employeeId: string }
  | { status: "AWAITING"; reason: string };

type Candidate = {
  id: string;
  userId: string;
  maxStudents: number;
  lastAssignedAt: Date | null;
  timezone: string;
  name: string;
};

async function onLeaveToday(tx: Tx, employees: Candidate[]) {
  if (!employees.length) return new Set<string>();
  const leaves = await tx.leaveRequest.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) }, status: "APPROVED" },
    select: { employeeId: true, fromDate: true, toDate: true },
  });
  const out = new Set<string>();
  for (const e of employees) {
    const today = dateOnly(dayKey(new Date(), e.timezone));
    if (leaves.some((l) => l.employeeId === e.id && l.fromDate <= today && l.toDate >= today)) out.add(e.id);
  }
  return out;
}

/** Pure ranking (unit-tested): fewest active → fewest recent → oldest lastAssignedAt → random. */
export function rankCandidates<T extends { id: string; active: number; recent: number; lastAssignedAt: Date | null }>(rows: T[], rand: () => number = Math.random): T[] {
  const withTie = rows.map((r) => ({ r, tie: rand() }));
  withTie.sort((a, b) => {
    if (a.r.active !== b.r.active) return a.r.active - b.r.active;
    if (a.r.recent !== b.r.recent) return a.r.recent - b.r.recent;
    const la = a.r.lastAssignedAt?.getTime() ?? 0;
    const lb = b.r.lastAssignedAt?.getTime() ?? 0;
    if (la !== lb) return la - lb;
    return a.tie - b.tie;
  });
  return withTie.map((x) => x.r);
}

async function ensureThread(tx: Tx, studentId: string, employeeId: string) {
  await tx.messageThread.updateMany({ where: { studentId, isActive: true, NOT: { employeeId } }, data: { isActive: false } });
  await tx.messageThread.upsert({
    where: { studentId_employeeId: { studentId, employeeId } },
    update: { isActive: true },
    create: { studentId, employeeId },
  });
}

/**
 * Run F2 for one student. `force` ignores the autoAssignEnabled setting
 * (admin clicked "Auto-assign"). Idempotent: a student with an active primary
 * assignment is left alone.
 */
export async function autoAssign(
  studentId: string,
  opts: { actorId?: string | null; force?: boolean; excludeEmployeeIds?: string[]; notifyPeople?: boolean } = {},
): Promise<AssignResult> {
  const enabled = opts.force || (await getSetting("autoAssignEnabled"));

  const result = await db.$transaction(
    async (tx) => {
      const student = await tx.studentProfile.findUnique({
        where: { id: studentId },
        select: { id: true, marketId: true, user: { select: { name: true } } },
      });
      if (!student) throw new AssignmentError("Student not found");

      // Serialise per student too (two events for the same student).
      await tx.$queryRaw`SELECT id FROM "StudentProfile" WHERE id = ${studentId} FOR UPDATE`;
      const existing = await tx.assignment.findFirst({
        where: { studentId, isActive: true, type: "PRIMARY" },
        select: { id: true, employeeId: true },
      });
      if (existing) return { status: "ALREADY_ASSIGNED" as const, assignmentId: existing.id, employeeId: existing.employeeId };

      const awaiting = async (reason: string) => {
        await tx.studentProfile.update({
          where: { id: studentId },
          data: { assignmentQueue: "AWAITING", awaitingSince: new Date() },
        });
        await audit({ actorId: opts.actorId, action: "assignment.awaiting", entity: "StudentProfile", entityId: studentId, after: { reason } }, tx);
        return { status: "AWAITING" as const, reason };
      };

      if (!enabled) return awaiting("Auto-assignment is turned off");

      const pool = await tx.employeeProfile.findMany({
        where: {
          acceptingNewStudents: true,
          marketIds: { has: student.marketId },
          user: { status: "ACTIVE", deletedAt: null, role: { in: ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN"] } },
          ...(opts.excludeEmployeeIds?.length ? { id: { notIn: opts.excludeEmployeeIds } } : {}),
          maxStudents: { gt: 0 },
        },
        select: { id: true, userId: true, maxStudents: true, lastAssignedAt: true, user: { select: { timezone: true, name: true } } },
        orderBy: { id: "asc" },
      });
      if (!pool.length) return awaiting("No employee serves this market");

      // Lock candidate rows in a stable order, then re-read loads under the lock.
      const ids = pool.map((p) => p.id);
      await tx.$queryRaw`SELECT id FROM "EmployeeProfile" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;

      const candidates: Candidate[] = pool.map((p) => ({
        id: p.id,
        userId: p.userId,
        maxStudents: p.maxStudents,
        lastAssignedAt: p.lastAssignedAt,
        timezone: p.user.timezone,
        name: p.user.name,
      }));
      const leave = await onLeaveToday(tx, candidates);
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400e3);
      const [activeCounts, recentCounts, fresh] = await Promise.all([
        tx.assignment.groupBy({ by: ["employeeId"], where: { employeeId: { in: ids }, isActive: true, type: "PRIMARY" }, _count: { _all: true } }),
        tx.assignment.groupBy({ by: ["employeeId"], where: { employeeId: { in: ids }, type: "PRIMARY", createdAt: { gte: sevenDaysAgo } }, _count: { _all: true } }),
        tx.employeeProfile.findMany({ where: { id: { in: ids } }, select: { id: true, lastAssignedAt: true } }),
      ]);
      const active = new Map(activeCounts.map((c) => [c.employeeId, c._count._all]));
      const recent = new Map(recentCounts.map((c) => [c.employeeId, c._count._all]));
      const last = new Map(fresh.map((f) => [f.id, f.lastAssignedAt]));

      const eligible = candidates
        .filter((c) => !leave.has(c.id))
        .map((c) => ({ ...c, active: active.get(c.id) ?? 0, recent: recent.get(c.id) ?? 0, lastAssignedAt: last.get(c.id) ?? null }))
        .filter((c) => c.active < c.maxStudents);
      if (!eligible.length) return awaiting("All eligible employees are at capacity or on leave");

      const pick = rankCandidates(eligible)[0]!;
      const now = new Date();
      const assignment = await tx.assignment.create({
        data: { studentId, employeeId: pick.id, source: "AUTO", type: "PRIMARY", createdById: opts.actorId ?? null, startsAt: now },
        select: { id: true },
      });
      await tx.employeeProfile.update({ where: { id: pick.id }, data: { lastAssignedAt: now } });
      await tx.studentProfile.update({ where: { id: studentId }, data: { assignmentQueue: "ASSIGNED", awaitingSince: null } });
      await ensureThread(tx, studentId, pick.id);
      await audit({ actorId: opts.actorId, action: "assignment.auto", entity: "Assignment", entityId: assignment.id, after: { studentId, employeeId: pick.id, load: pick.active + 1, max: pick.maxStudents } }, tx);
      return { status: "ASSIGNED" as const, assignmentId: assignment.id, employeeId: pick.id };
    },
    { isolationLevel: "ReadCommitted", timeout: 20_000, maxWait: 20_000 },
  );

  if (opts.notifyPeople !== false) await notifyAssignment(studentId, result);
  return result;
}

async function notifyAssignment(studentId: string, result: AssignResult) {
  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      userId: true,
      user: { select: { name: true } },
      subscriptions: { where: { status: "ACTIVE" }, take: 1, orderBy: { createdAt: "desc" }, select: { planPrice: { select: { dailyTarget: true, plan: { select: { name: true } } } } } },
    },
  });
  if (!student) return;
  if (result.status === "AWAITING") {
    await notifyManagers("awaiting_assignment", { studentName: student.user.name, reason: result.reason });
    void sendAlert("awaiting_assignment", { title: student.user.name, lines: [result.reason], link: "/admin/assignments", linkLabel: "Open assignments" });
    return;
  }
  if (result.status !== "ASSIGNED") return;
  const emp = await db.employeeProfile.findUnique({ where: { id: result.employeeId }, select: { userId: true, user: { select: { name: true } } } });
  if (!emp) return;
  const sub = student.subscriptions[0];
  await notify(student.userId, "assigned_student", { employeeFirstName: firstName(emp.user.name) });
  await notify(emp.userId, "assigned_employee", { studentName: student.user.name, studentId, plan: sub?.planPrice.plan.name ?? "—", target: sub?.planPrice.dailyTarget ?? "—" });
}

/** Manual assignment from the AWAITING queue or a reassignment (closes the old one; history stays). */
export async function reassign(input: {
  studentId: string;
  employeeId: string;
  reason: string;
  actorId: string;
  allowOverCapacity?: boolean;
}) {
  const { studentId, employeeId, reason, actorId } = input;
  const outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EmployeeProfile" WHERE id = ${employeeId} FOR UPDATE`;
    const emp = await tx.employeeProfile.findUnique({
      where: { id: employeeId },
      select: { id: true, maxStudents: true, marketIds: true, user: { select: { status: true } } },
    });
    if (!emp || emp.user.status !== "ACTIVE") throw new AssignmentError("That employee isn't active.");
    const student = await tx.studentProfile.findUnique({ where: { id: studentId }, select: { marketId: true } });
    if (!student) throw new AssignmentError("Student not found.");
    if (!emp.marketIds.includes(student.marketId)) throw new AssignmentError("That employee doesn't serve this student's market.");

    const load = await tx.assignment.count({ where: { employeeId, isActive: true, type: "PRIMARY" } });
    const old = await tx.assignment.findFirst({ where: { studentId, isActive: true, type: "PRIMARY" }, select: { id: true, employeeId: true } });
    if (old?.employeeId === employeeId) throw new AssignmentError("The student is already assigned to this employee.");
    if (load >= emp.maxStudents && !input.allowOverCapacity) throw new AssignmentError(`That employee is at capacity (${load}/${emp.maxStudents}).`);

    const now = new Date();
    if (old) {
      await tx.assignment.update({ where: { id: old.id }, data: { isActive: false, endsAt: now, endReason: reason } });
    }
    const created = await tx.assignment.create({
      data: { studentId, employeeId, source: "MANUAL", type: "PRIMARY", createdById: actorId, startsAt: now },
      select: { id: true },
    });
    await tx.employeeProfile.update({ where: { id: employeeId }, data: { lastAssignedAt: now } });
    await tx.studentProfile.update({ where: { id: studentId }, data: { assignmentQueue: "ASSIGNED", awaitingSince: null } });
    await ensureThread(tx, studentId, employeeId);
    await audit({ actorId, action: old ? "assignment.reassign" : "assignment.manual", entity: "Assignment", entityId: created.id, before: old ?? undefined, after: { studentId, employeeId, reason } }, tx);
    return { oldEmployeeId: old?.employeeId ?? null, assignmentId: created.id };
  });

  const [student, newEmp, oldEmp] = await Promise.all([
    db.studentProfile.findUnique({ where: { id: studentId }, select: { userId: true, user: { select: { name: true } } } }),
    db.employeeProfile.findUnique({ where: { id: employeeId }, select: { userId: true, user: { select: { name: true } } } }),
    outcome.oldEmployeeId ? db.employeeProfile.findUnique({ where: { id: outcome.oldEmployeeId }, select: { userId: true } }) : null,
  ]);
  if (student && newEmp) {
    await notify(student.userId, outcome.oldEmployeeId ? "reassigned_student" : "assigned_student", { employeeFirstName: firstName(newEmp.user.name) });
    await notify(newEmp.userId, "assigned_employee", { studentName: student.user.name, studentId, plan: "", target: "" });
    if (oldEmp) await notify(oldEmp.userId, "unassigned_employee", { studentName: student.user.name, reason });
  }
  return outcome;
}

// ───────────────────────────── Cover during leave (F2 + F9, D-144) ─────────────────────────────

export const CoverEntry = z.object({ studentId: z.string().min(1).max(64), coverEmployeeId: z.string().min(1).max(64) });
export const ApplyCoverInput = z.object({
  leaveRequestId: z.string().min(1).max(64),
  covers: z.array(CoverEntry).max(500),
});
export type CoverEntryT = z.infer<typeof CoverEntry>;

export type CoverCandidate = {
  employeeId: string;
  userId: string;
  name: string;
  code: string;
  marketIds: string[];
  /** Active PRIMARY students + COVER rows overlapping the window (other leaves). */
  load: number;
  max: number;
  accepting: boolean;
  sameMarket: boolean;
  onLeave: false;
};

type CoverWindow = {
  /** Employee on leave. */
  primaryEmployeeId: string;
  primaryMarketIds: string[];
  /** Leave dates (date-only, UTC midnight) used to detect overlapping leave. */
  fromDate: Date;
  toDate: Date;
  /** Instants the COVER rows span (start of fromDate → start of the day after toDate, employee tz). */
  from: Date;
  to: Date;
  /** Rows of this leave don't count towards a candidate's load. */
  leaveRequestId: string | null;
};

/**
 * Employees who could cover: active (not deleted), not interview coaches
 * (D-140), not the employee on leave, not on approved leave overlapping the
 * window. Sorted same market first, then by load ratio.
 */
export async function listCoverCandidates(client: Tx | typeof db, w: CoverWindow): Promise<CoverCandidate[]> {
  const [away, emps] = await Promise.all([
    client.leaveRequest.findMany({ where: { status: "APPROVED", fromDate: { lte: w.toDate }, toDate: { gte: w.fromDate } }, select: { employeeId: true } }),
    client.employeeProfile.findMany({
      where: { id: { not: w.primaryEmployeeId }, maxStudents: { gt: 0 }, user: { status: "ACTIVE", deletedAt: null, role: { not: "COACH" } } },
      select: { id: true, userId: true, employeeCode: true, maxStudents: true, marketIds: true, acceptingNewStudents: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  const awayIds = new Set(away.map((a) => a.employeeId));
  const pool = emps.filter((e) => !awayIds.has(e.id));
  if (!pool.length) return [];
  const ids = pool.map((e) => e.id);
  const loads = await client.assignment.groupBy({
    by: ["employeeId"],
    where: {
      employeeId: { in: ids },
      isActive: true,
      OR: [
        { type: "PRIMARY" },
        { type: "COVER", startsAt: { lt: w.to }, OR: [{ endsAt: null }, { endsAt: { gt: w.from } }], ...(w.leaveRequestId ? { NOT: { leaveRequestId: w.leaveRequestId } } : {}) },
      ],
    },
    _count: { _all: true },
  });
  const load = new Map(loads.map((l) => [l.employeeId, l._count._all]));
  return pool
    .map((e) => ({
      employeeId: e.id,
      userId: e.userId,
      name: e.user.name,
      code: e.employeeCode,
      marketIds: e.marketIds,
      load: load.get(e.id) ?? 0,
      max: e.maxStudents,
      accepting: e.acceptingNewStudents,
      sameMarket: e.marketIds.some((m) => w.primaryMarketIds.includes(m)),
      onLeave: false as const,
    }))
    .sort((a, b) => Number(b.sameMarket) - Number(a.sameMarket) || a.load / a.max - b.load / b.max || a.name.localeCompare(b.name));
}

/**
 * Pure suggestion (unit-tested): each student goes to the candidate serving
 * their market with the lowest load; loads are bumped as we go so ties spread
 * round-robin. A student already covered for this leave keeps that cover
 * while it's still a candidate. Returns studentId → employeeId | null.
 */
export function suggestCovers(
  students: { studentId: string; marketId: string }[],
  candidates: Pick<CoverCandidate, "employeeId" | "marketIds" | "load" | "max">[],
  existing: Record<string, string> = {},
): Record<string, string | null> {
  const load = new Map(candidates.map((c) => [c.employeeId, c.load]));
  const out: Record<string, string | null> = {};
  const pending: typeof students = [];
  for (const s of students) {
    const keep = existing[s.studentId];
    if (keep && load.has(keep)) {
      out[s.studentId] = keep;
      load.set(keep, (load.get(keep) ?? 0) + 1);
    } else pending.push(s);
  }
  for (const s of pending) {
    const inMarket = candidates.filter((c) => c.marketIds.includes(s.marketId));
    const pool = inMarket.length ? inMarket : candidates;
    let best: (typeof pool)[number] | null = null;
    for (const c of pool) {
      const l = load.get(c.employeeId) ?? 0;
      if (!best) best = c;
      else {
        const bl = load.get(best.employeeId) ?? 0;
        if (l < bl || (l === bl && l / c.max < bl / best.max)) best = c;
      }
    }
    out[s.studentId] = best?.employeeId ?? null;
    if (best) load.set(best.employeeId, (load.get(best.employeeId) ?? 0) + 1);
  }
  return out;
}

export type CoverPlanResult = {
  leaveRequestId: string | null;
  primaryEmployeeId: string;
  primaryUserId: string;
  primaryName: string;
  dates: string;
  created: number;
  ended: number;
  /** cover employee → students they cover (full plan, not just changes). */
  byCover: { employeeId: string; userId: string; name: string; students: { studentId: string; userId: string; name: string; isNew: boolean }[] }[];
};

/** "24–28 Oct" / "28 Oct – 2 Nov" / "24 Oct" in the employee's calendar. */
export function formatDateRange(fromKey: string, toKey: string) {
  const f = (k: string, p: string) => formatInTz(new Date(`${k}T12:00:00Z`), "UTC", p);
  if (fromKey === toKey) return f(fromKey, "d MMM");
  if (fromKey.slice(0, 7) === toKey.slice(0, 7)) return `${f(fromKey, "d")}–${f(toKey, "d MMM")}`;
  return `${f(fromKey, "d MMM")} – ${f(toKey, "d MMM")}`;
}

/** Window the COVER rows span: start of fromDate → start of the day after toDate, in the employee's timezone. */
export function coverWindow(fromDate: Date, toDate: Date, tz: string) {
  const fromKey = keyFromDateOnly(fromDate);
  const toKey = keyFromDateOnly(toDate);
  return { fromKey, toKey, from: startOfDayInTz(fromKey, tz), to: startOfDayInTz(addDayKey(toKey, 1), tz) };
}

/**
 * Core of the cover plan — runs inside the caller's transaction so approving a
 * leave and covering its applicants is one atomic step (D-144).
 * - every student must be an active PRIMARY student of the employee on leave;
 * - every cover must be a current candidate (see listCoverCandidates);
 * - active COVER rows of this leave that aren't in the plan are ended, missing
 *   rows are created, identical rows are kept (idempotent);
 * - leaveRequest.coverEmployeeId = the cover with the most students.
 */
async function applyCoverCore(tx: Tx, actorId: string, w: CoverWindow & { primaryUserId: string; primaryName: string; fromKey: string; toKey: string }, rawCovers: CoverEntryT[], now = new Date()): Promise<CoverPlanResult> {
  const covers = z.array(CoverEntry).max(500).parse(rawCovers);
  const seen = new Set<string>();
  for (const c of covers) {
    if (seen.has(c.studentId)) throw new AssignmentError("Each applicant can have only one cover.");
    seen.add(c.studentId);
    if (c.coverEmployeeId === w.primaryEmployeeId) throw new AssignmentError("Choose a different employee as cover.");
  }
  const primaries = await tx.assignment.findMany({
    where: { employeeId: w.primaryEmployeeId, isActive: true, type: "PRIMARY" },
    select: { studentId: true, student: { select: { userId: true, user: { select: { name: true } } } } },
  });
  const students = new Map(primaries.map((p) => [p.studentId, { userId: p.student.userId, name: p.student.user.name }]));
  const candidates = new Map((await listCoverCandidates(tx, w)).map((c) => [c.employeeId, c]));
  for (const c of covers) {
    const s = students.get(c.studentId);
    if (!s) throw new AssignmentError("One of the applicants isn't assigned to this employee any more. Reload and try again.");
    const cand = candidates.get(c.coverEmployeeId);
    if (!cand) throw new AssignmentError(`The chosen cover for ${s.name} isn't available (inactive, an interview coach, or on leave at the same time).`);
  }

  const existing = w.leaveRequestId ? await tx.assignment.findMany({ where: { leaveRequestId: w.leaveRequestId, type: "COVER", isActive: true }, select: { id: true, studentId: true, employeeId: true } }) : [];
  const wanted = new Set(covers.map((c) => `${c.studentId}:${c.coverEmployeeId}`));
  const have = new Set(existing.map((e) => `${e.studentId}:${e.employeeId}`));
  const toEnd = existing.filter((e) => !wanted.has(`${e.studentId}:${e.employeeId}`));
  const toCreate = covers.filter((c) => !have.has(`${c.studentId}:${c.coverEmployeeId}`));
  if (toEnd.length) {
    await tx.assignment.updateMany({ where: { id: { in: toEnd.map((e) => e.id) } }, data: { isActive: false, endsAt: now, endReason: "Cover changed" } });
  }
  if (toCreate.length) {
    await tx.assignment.createMany({
      data: toCreate.map((c) => ({ studentId: c.studentId, employeeId: c.coverEmployeeId, type: "COVER" as const, source: "MANUAL" as const, startsAt: w.from, endsAt: w.to, leaveRequestId: w.leaveRequestId, createdById: actorId })),
    });
  }
  const counts = new Map<string, number>();
  for (const c of covers) counts.set(c.coverEmployeeId, (counts.get(c.coverEmployeeId) ?? 0) + 1);
  const primaryCover = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  if (w.leaveRequestId) await tx.leaveRequest.update({ where: { id: w.leaveRequestId }, data: { coverEmployeeId: primaryCover } });
  await audit(
    {
      actorId,
      action: "assignment.cover",
      entity: w.leaveRequestId ? "LeaveRequest" : "EmployeeProfile",
      entityId: w.leaveRequestId ?? w.primaryEmployeeId,
      before: { covers: existing.map((e) => ({ studentId: e.studentId, coverEmployeeId: e.employeeId })) },
      after: { covers, from: w.from, to: w.to, primaryCover, created: toCreate.length, ended: toEnd.length },
    },
    tx,
  );
  const created = new Set(toCreate.map((c) => `${c.studentId}:${c.coverEmployeeId}`));
  const byCover = [...counts.keys()].map((employeeId) => {
    const cand = candidates.get(employeeId)!;
    return {
      employeeId,
      userId: cand.userId,
      name: cand.name,
      students: covers
        .filter((c) => c.coverEmployeeId === employeeId)
        .map((c) => ({ studentId: c.studentId, userId: students.get(c.studentId)!.userId, name: students.get(c.studentId)!.name, isNew: created.has(`${c.studentId}:${employeeId}`) })),
    };
  });
  return { leaveRequestId: w.leaveRequestId, primaryEmployeeId: w.primaryEmployeeId, primaryUserId: w.primaryUserId, primaryName: w.primaryName, dates: formatDateRange(w.fromKey, w.toKey), created: toCreate.length, ended: toEnd.length, byCover };
}

/** Load the leave and build the cover window (status is returned so callers can insist on APPROVED). */
export async function loadCoverWindow(client: Tx | typeof db, leaveRequestId: string) {
  const req = await client.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    select: { id: true, status: true, employeeId: true, fromDate: true, toDate: true, employee: { select: { userId: true, marketIds: true, user: { select: { name: true, timezone: true } } } } },
  });
  if (!req) throw new AssignmentError("Leave request not found.");
  const win = coverWindow(req.fromDate, req.toDate, req.employee.user.timezone);
  return {
    status: req.status,
    window: { leaveRequestId: req.id, primaryEmployeeId: req.employeeId, primaryUserId: req.employee.userId, primaryName: req.employee.user.name, primaryMarketIds: req.employee.marketIds, fromDate: req.fromDate, toDate: req.toDate, ...win },
  };
}

/** Apply a cover plan inside an existing transaction (the leave must already be APPROVED in `tx`). */
export async function applyCoverTx(tx: Tx, actorId: string, raw: z.input<typeof ApplyCoverInput>, now = new Date()) {
  const input = ApplyCoverInput.parse(raw);
  const { status, window } = await loadCoverWindow(tx, input.leaveRequestId);
  if (status !== "APPROVED") throw new AssignmentError("Approve the request before setting cover.");
  return applyCoverCore(tx, actorId, window, input.covers, now);
}

/** Notifications for a (changed) cover plan: one per cover employee, one to the employee on leave, one per newly covered student. */
export async function notifyCoverPlan(r: CoverPlanResult) {
  if (!r.created && !r.ended) return;
  const list = (xs: { name: string }[]) => xs.map((x) => x.name).join(", ");
  for (const c of r.byCover) {
    await notify(c.userId, "cover_employee", { count: c.students.length, primaryName: r.primaryName, dates: r.dates, names: list(c.students) });
    for (const s of c.students.filter((x) => x.isNew)) {
      await notify(s.userId, "cover_student", { primaryFirstName: firstName(r.primaryName), coverFirstName: firstName(c.name), dates: r.dates });
    }
  }
  if (r.leaveRequestId) {
    const summary = r.byCover.length ? r.byCover.map((c) => `${c.name}: ${list(c.students)}`).join(" · ") : "No cover was assigned.";
    await notify(r.primaryUserId, "leave_cover_set", { dates: r.dates, summary });
  }
}

/** Per-applicant cover for an approved leave (admin "Change cover" / approve-and-cover). */
export async function applyCover(actor: { id: string }, raw: z.input<typeof ApplyCoverInput>, now = new Date()) {
  const r = await db.$transaction((tx) => applyCoverTx(tx, actor.id, raw, now), { timeout: 20_000, maxWait: 20_000 });
  await notifyCoverPlan(r).catch((e) => log.error("cover.notify_failed", { err: e }));
  return r;
}

/**
 * Temporary cover during approved leave (F2): one employee covers every active
 * PRIMARY student over [from, to]. Thin wrapper over the per-applicant plan;
 * with a leaveRequestId the rows are linked to the leave (editable later).
 */
export async function setCover(input: { primaryEmployeeId: string; coverEmployeeId: string; from: Date; to: Date; actorId: string; leaveRequestId?: string }) {
  if (input.primaryEmployeeId === input.coverEmployeeId) throw new AssignmentError("Choose a different employee as cover.");
  const r = await db.$transaction(
    async (tx) => {
      const primaries = await tx.assignment.findMany({ where: { employeeId: input.primaryEmployeeId, isActive: true, type: "PRIMARY" }, select: { studentId: true } });
      const covers = primaries.map((p) => ({ studentId: p.studentId, coverEmployeeId: input.coverEmployeeId }));
      if (input.leaveRequestId) return applyCoverTx(tx, input.actorId, { leaveRequestId: input.leaveRequestId, covers });
      const primary = await tx.employeeProfile.findUnique({ where: { id: input.primaryEmployeeId }, select: { userId: true, marketIds: true, user: { select: { name: true, timezone: true } } } });
      if (!primary) throw new AssignmentError("Employee not found.");
      const fromKey = dayKey(input.from, primary.user.timezone);
      const toKey = dayKey(new Date(input.to.getTime() - 1), primary.user.timezone);
      return applyCoverCore(
        tx,
        input.actorId,
        { leaveRequestId: null, primaryEmployeeId: input.primaryEmployeeId, primaryUserId: primary.userId, primaryName: primary.user.name, primaryMarketIds: primary.marketIds, fromDate: dateOnly(fromKey), toDate: dateOnly(toKey), from: input.from, to: input.to, fromKey, toKey },
        covers,
      );
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
  await notifyCoverPlan(r).catch((e) => log.error("cover.notify_failed", { err: e }));
  return { count: r.created };
}

/** Hourly: COVER rows whose window has passed are closed (they already grant no access past endsAt). */
export async function endExpiredCovers(now = new Date()) {
  const r = await db.assignment.updateMany({ where: { type: "COVER", isActive: true, endsAt: { lt: now } }, data: { isActive: false, endReason: "Leave ended" } });
  return r.count;
}

/** Re-home every student of a deactivated employee through F2 (excluding that employee). */
export async function rehomeEmployeeStudents(employeeId: string, actorId: string | null) {
  const active = await db.assignment.findMany({ where: { employeeId, isActive: true }, select: { id: true, studentId: true, type: true } });
  const now = new Date();
  await db.assignment.updateMany({ where: { employeeId, isActive: true }, data: { isActive: false, endsAt: now, endReason: "Employee deactivated" } });
  await db.messageThread.updateMany({ where: { employeeId, isActive: true }, data: { isActive: false } });
  const results: AssignResult[] = [];
  for (const a of active.filter((x) => x.type === "PRIMARY")) {
    results.push(await autoAssign(a.studentId, { actorId, force: true, excludeEmployeeIds: [employeeId] }));
  }
  await audit({ actorId, action: "assignment.rehome", entity: "EmployeeProfile", entityId: employeeId, after: { students: results.length } });
  return results;
}

/** Load board (admin Assignments page). */
export async function loadBoard() {
  const emps = await db.employeeProfile.findMany({
    // Interview coaches never take application assignments (D-140).
    where: { user: { status: { in: ["ACTIVE", "INVITED"] }, deletedAt: null, role: { not: "COACH" } }, maxStudents: { gt: 0 } },
    select: {
      id: true,
      employeeCode: true,
      maxStudents: true,
      acceptingNewStudents: true,
      marketIds: true,
      user: { select: { name: true, status: true } },
      _count: { select: { assignments: { where: { isActive: true, type: "PRIMARY" } } } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return emps.map((e) => ({
    id: e.id,
    code: e.employeeCode,
    name: e.user.name,
    status: e.user.status,
    accepting: e.acceptingNewStudents,
    marketIds: e.marketIds,
    active: e._count.assignments,
    max: e.maxStudents,
  }));
}
