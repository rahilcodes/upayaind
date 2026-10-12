import "server-only";
import type { Role, SubscriptionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { addDayKey, dateOnly, dayKey, dayRangeInTz, hhmmToMinutes, minutesIntoDay, startOfDayInTz, weekdayOfKey } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { notify, notifyManagers } from "./notify";
import { getSetting } from "./settings";
import { employeeContext, parseSchedule, type WorkSchedule } from "./attendance";

/**
 * Daily targets (SPEC F10).
 *
 * - Day boundaries use the EMPLOYEE's timezone; target days follow the
 *   STUDENT's market working days.
 * - RAG compares today's applications with the target pro-rated across the
 *   employee's working hours (WorkSchedule startTime + hours, employee tz):
 *   green ≥ 100 %, amber 60–99 %, red < 60 %. "done" once the full target is met;
 *   "off" when the subscription isn't ACTIVE; "rest" on a non-working day.
 */

export type Rag = "green" | "amber" | "red" | "off" | "done" | "rest";

/** Share of the working day elapsed at `now` (0 before start, 1 after the scheduled hours). */
export function proRateFraction(now: Date, tz: string, schedule: Pick<WorkSchedule, "startTime" | "hours">) {
  const start = hhmmToMinutes(schedule.startTime);
  const len = Math.max(1, schedule.hours * 60);
  const m = minutesIntoDay(now, tz);
  return Math.min(1, Math.max(0, (m - start) / len));
}

export function ragFor(input: { done: number; target: number; fraction: number; active: boolean; workingDay?: boolean }): { rag: Rag; expected: number; ratio: number } {
  if (!input.active) return { rag: "off", expected: 0, ratio: 0 };
  if (input.workingDay === false || input.target <= 0) return { rag: "rest", expected: 0, ratio: 1 };
  if (input.done >= input.target) return { rag: "done", expected: input.target, ratio: input.done / input.target };
  const expected = input.target * input.fraction;
  if (expected <= 0) return { rag: "green", expected: 0, ratio: 1 };
  const ratio = input.done / expected;
  if (ratio >= 1) return { rag: "green", expected, ratio };
  if (ratio >= 0.6) return { rag: "amber", expected, ratio };
  return { rag: "red", expected, ratio };
}

type Actor = { id: string; role: Role };

/** Active (now) assignments for an employee: PRIMARY + COVER inside its window. */
export async function assignedStudentIds(employeeId: string, now = new Date()) {
  const rows = await db.assignment.findMany({
    where: { employeeId, isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { studentId: true, type: true, endsAt: true },
    orderBy: { startsAt: "asc" },
  });
  const map = new Map<string, { type: "PRIMARY" | "COVER"; endsAt: Date | null }>();
  for (const r of rows) if (!map.has(r.studentId) || r.type === "PRIMARY") map.set(r.studentId, { type: r.type, endsAt: r.endsAt });
  return map;
}

export type StudentCard = {
  id: string;
  name: string;
  role: string | null;
  plan: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  active: boolean;
  periodEnd: Date | null;
  onboarded: boolean;
  assignment: "PRIMARY" | "COVER";
  coverEndsAt: Date | null;
  done: number;
  target: number;
  expected: number;
  rag: Rag;
  lastAppliedAt: Date | null;
  unread: number;
  totalApplications: number;
  market: string;
};

async function subscriptionFor(studentIds: string[]) {
  const subs = await db.subscription.findMany({
    where: { studentId: { in: studentIds } },
    orderBy: { createdAt: "desc" },
    select: { studentId: true, status: true, currentPeriodEnd: true, planPrice: { select: { dailyTarget: true, plan: { select: { name: true } } } } },
  });
  const out = new Map<string, (typeof subs)[number]>();
  for (const s of subs) {
    const cur = out.get(s.studentId);
    if (!cur || (cur.status !== "ACTIVE" && s.status === "ACTIVE")) out.set(s.studentId, s);
  }
  return out;
}

/** Cards for "My students today" + the inputs for the stats row. */
export async function getStudentCards(employeeId: string, opts: { now?: Date; viewerUserId?: string } = {}) {
  const now = opts.now ?? new Date();
  const ctx = await employeeContext(employeeId);
  const assigned = await assignedStudentIds(employeeId, now);
  const ids = [...assigned.keys()];
  const { start, end, key } = dayRangeInTz(now, ctx.timezone);
  const fraction = proRateFraction(now, ctx.timezone, ctx.schedule);
  if (!ids.length) return { cards: [] as StudentCard[], fraction, timezone: ctx.timezone, schedule: ctx.schedule, key };

  const [students, subs, todayCounts, lastApps, totals, unread] = await Promise.all([
    db.studentProfile.findMany({
      where: { id: { in: ids } },
      select: { id: true, targetTitles: true, onboardingCompletedAt: true, user: { select: { name: true } }, market: { select: { code: true, workingDays: true } } },
    }),
    subscriptionFor(ids),
    db.jobApplication.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, appliedAt: { gte: start, lt: end } }, _count: { _all: true } }),
    db.jobApplication.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, appliedAt: { not: null } }, _max: { appliedAt: true } }),
    db.jobApplication.groupBy({ by: ["studentId"], where: { studentId: { in: ids } }, _count: { _all: true } }),
    opts.viewerUserId
      ? db.message.groupBy({ by: ["threadId"], where: { thread: { studentId: { in: ids }, employeeId, isActive: true }, senderId: { not: opts.viewerUserId }, readAt: null }, _count: { _all: true } })
      : Promise.resolve([] as { threadId: string; _count: { _all: number } }[]),
  ]);
  const threadIds = unread.map((u) => u.threadId);
  const threads = threadIds.length ? await db.messageThread.findMany({ where: { id: { in: threadIds } }, select: { id: true, studentId: true } }) : [];
  const unreadByStudent = new Map<string, number>();
  for (const u of unread) {
    const t = threads.find((x) => x.id === u.threadId);
    if (t) unreadByStudent.set(t.studentId, (unreadByStudent.get(t.studentId) ?? 0) + u._count._all);
  }
  const wd = weekdayOfKey(key);
  const cards: StudentCard[] = students.map((s) => {
    const sub = subs.get(s.id);
    const active = sub?.status === "ACTIVE";
    const workingDay = s.market.workingDays.includes(wd);
    const target = active && workingDay ? (sub?.planPrice.dailyTarget ?? 0) : 0;
    const done = todayCounts.find((c) => c.studentId === s.id)?._count._all ?? 0;
    const r = ragFor({ done, target, fraction, active, workingDay });
    const a = assigned.get(s.id)!;
    return {
      id: s.id,
      name: s.user.name,
      role: s.targetTitles[0] ?? null,
      plan: sub?.planPrice.plan.name ?? null,
      subscriptionStatus: sub?.status ?? null,
      active,
      periodEnd: sub?.currentPeriodEnd ?? null,
      onboarded: Boolean(s.onboardingCompletedAt),
      assignment: a.type,
      coverEndsAt: a.type === "COVER" ? a.endsAt : null,
      done,
      target,
      expected: r.expected,
      rag: r.rag,
      lastAppliedAt: lastApps.find((x) => x.studentId === s.id)?._max.appliedAt ?? null,
      unread: unreadByStudent.get(s.id) ?? 0,
      totalApplications: totals.find((x) => x.studentId === s.id)?._count._all ?? 0,
      market: s.market.code,
    };
  });
  const order: Record<Rag, number> = { red: 0, amber: 1, green: 2, done: 3, rest: 4, off: 5 };
  cards.sort((a, b) => order[a.rag] - order[b.rag] || a.name.localeCompare(b.name));
  return { cards, fraction, timezone: ctx.timezone, schedule: ctx.schedule, key };
}

export async function getMyStudentCards(user: Actor, now = new Date()) {
  const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ep) return null;
  return getStudentCards(ep.id, { now, viewerUserId: user.id });
}

// ───────────────────────────── StudentDay nightly ─────────────────────────────

/** The employee whose timezone defines a student's day: the active primary assignee. */
async function primaryEmployeeTz(studentId: string) {
  const a = await db.assignment.findFirst({ where: { studentId, isActive: true, type: "PRIMARY" }, orderBy: { startsAt: "desc" }, select: { employee: { select: { user: { select: { timezone: true } } } } } });
  return a?.employee.user.timezone ?? null;
}

/** Recount + set the correct target (0 when inactive or not a market working day). Idempotent. */
export async function rollupStudentDay(studentId: string, key: string, tz: string) {
  const start = startOfDayInTz(key, tz);
  const end = startOfDayInTz(addDayKey(key, 1), tz);
  const [applied, subs, s] = await Promise.all([
    db.jobApplication.count({ where: { studentId, appliedAt: { gte: start, lt: end } } }),
    subscriptionFor([studentId]),
    db.studentProfile.findUnique({ where: { id: studentId }, select: { market: { select: { workingDays: true } } } }),
  ]);
  const sub = subs.get(studentId);
  const target = sub?.status === "ACTIVE" && s?.market.workingDays.includes(weekdayOfKey(key)) ? sub.planPrice.dailyTarget : 0;
  await db.studentDay.upsert({
    where: { studentId_date: { studentId, date: dateOnly(key) } },
    update: { applied, target },
    create: { studentId, date: dateOnly(key), applied, target },
  });
  return { applied, target };
}

/** Nightly: roll up "yesterday" (in the primary employee's tz) for every assigned student. */
export async function runStudentDayRollup(now = new Date()) {
  const students = await db.assignment.findMany({ where: { isActive: true, type: "PRIMARY" }, distinct: ["studentId"], select: { studentId: true } });
  let n = 0;
  for (const { studentId } of students) {
    const tz = await primaryEmployeeTz(studentId);
    if (!tz) continue;
    const today = dayKey(now, tz);
    await rollupStudentDay(studentId, addDayKey(today, -1), tz);
    await rollupStudentDay(studentId, today, tz);
    n++;
  }
  return { students: n };
}

// ───────────────────────────── Below-target alert ─────────────────────────────

/** Is `now` inside [alertTime, alertTime + 60 min) in `tz`? (The job runs hourly.) */
export function inAlertWindow(now: Date, tz: string, alertTime: string) {
  const m = minutesIntoDay(now, tz);
  const a = hhmmToMinutes(alertTime);
  return m >= a && m < a + 60;
}

/**
 * Hourly: for every employee whose local time is in the alert window, list
 * assigned active students below 50 % of today's full target (D-071), notify the employee once per day, and send one summary to managers.
 */
export async function runBelowTargetAlerts(now = new Date()) {
  const alertTime = await getSetting("belowTargetAlertTime");
  const emps = await db.employeeProfile.findMany({ where: { user: { status: "ACTIVE", deletedAt: null } }, select: { id: true, userId: true, workSchedule: true, user: { select: { timezone: true, name: true } } } });
  const managerLines: string[] = [];
  let notified = 0;
  for (const e of emps) {
    const tz = e.user.timezone;
    if (!inAlertWindow(now, tz, alertTime)) continue;
    const schedule = parseSchedule(e.workSchedule);
    if (!schedule.days.includes(weekdayOfKey(dayKey(now, tz)))) continue;
    const { start } = dayRangeInTz(now, tz);
    const already = await db.notification.count({ where: { userId: e.userId, type: "below_target", createdAt: { gte: start } } });
    if (already) continue;
    const { cards } = await getStudentCards(e.id, { now });
    const below = cards.filter((c) => c.active && c.target > 0 && c.done < 0.5 * c.target);
    if (!below.length) continue;
    const list = below.map((c) => `${c.name}: ${c.done} / ${c.target}`).join(" · ");
    await notify(e.userId, "below_target", { count: below.length, list, link: "/work" });
    managerLines.push(`${e.user.name} (${formatInTz(now, tz, "h:mm a")}): ${list}`);
    notified++;
  }
  if (managerLines.length) {
    const count = managerLines.reduce((a, l) => a + l.split(" · ").length, 0);
    await notifyManagers("below_target", { count, list: managerLines.join("\n"), link: "/admin/attendance" });
  }
  return { employees: notified };
}
