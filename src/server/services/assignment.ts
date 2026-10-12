import "server-only";
import { db, Prisma, type Tx } from "@/server/db";
import { dateOnly, dayKey } from "@/lib/dates";
import { firstName } from "@/lib/utils";
import { audit } from "./audit";
import { notify, notifyManagers } from "./notify";
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
          user: { status: "ACTIVE", deletedAt: null, role: { in: ["EMPLOYEE", "MANAGER", "ADMIN"] } },
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

/** Temporary cover during approved leave (F2): COVER assignments limited to [from, to]. */
export async function setCover(input: { primaryEmployeeId: string; coverEmployeeId: string; from: Date; to: Date; actorId: string; leaveRequestId?: string }) {
  if (input.primaryEmployeeId === input.coverEmployeeId) throw new AssignmentError("Choose a different employee as cover.");
  const primaries = await db.assignment.findMany({
    where: { employeeId: input.primaryEmployeeId, isActive: true, type: "PRIMARY" },
    select: { studentId: true, student: { select: { user: { select: { name: true } } } } },
  });
  const [cover, primary] = await Promise.all([
    db.employeeProfile.findUnique({ where: { id: input.coverEmployeeId }, select: { userId: true } }),
    db.employeeProfile.findUnique({ where: { id: input.primaryEmployeeId }, select: { user: { select: { name: true } } } }),
  ]);
  if (!cover || !primary) throw new AssignmentError("Employee not found.");
  const created = await db.$transaction(
    primaries.map((p) =>
      db.assignment.create({
        data: { studentId: p.studentId, employeeId: input.coverEmployeeId, type: "COVER", source: "MANUAL", startsAt: input.from, endsAt: input.to, createdById: input.actorId },
      }),
    ),
  );
  if (input.leaveRequestId) await db.leaveRequest.update({ where: { id: input.leaveRequestId }, data: { coverEmployeeId: input.coverEmployeeId } });
  await audit({ actorId: input.actorId, action: "assignment.cover", entity: "EmployeeProfile", entityId: input.primaryEmployeeId, after: { cover: input.coverEmployeeId, from: input.from, to: input.to, students: primaries.length } });
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  for (const p of primaries) {
    await notify(cover.userId, "cover_employee", { studentName: p.student.user.name, from: fmt(input.from), to: fmt(input.to), primaryName: primary.user.name });
  }
  return { count: created.length };
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
    where: { user: { status: { in: ["ACTIVE", "INVITED"] }, deletedAt: null }, maxStudents: { gt: 0 } },
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
