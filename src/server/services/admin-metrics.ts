import "server-only";
import type { BillingInterval } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { addDayKey, dayKey, dayRangeInTz, hhmmToMinutes, isoWeekday, minutesIntoDay, startOfDayInTz } from "@/lib/dates";
import { clamp } from "@/lib/utils";
import { INTERVAL_MONTHS } from "./catalog";

/**
 * Admin metrics (SPEC §11 overview, F10 targets, M10). Pure helpers are
 * exported for unit tests; DB functions use aggregates (no per-row loops
 * against the database).
 */

// ─────────────────────────── Pure helpers ───────────────────────────

export type MrrRow = { currency: string; amountMinor: number; subscriptions: number };

/**
 * Monthly recurring revenue per currency: each active subscription's price is
 * normalised to one month via INTERVAL_MONTHS. Currencies are never mixed.
 */
export function mrrByCurrency(subs: { amountMinor: number; currency: string; interval: BillingInterval }[]): MrrRow[] {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const s of subs) {
    const months = INTERVAL_MONTHS[s.interval] || 1;
    const cur = s.currency.toUpperCase();
    const a = acc.get(cur) ?? { sum: 0, n: 0 };
    a.sum += s.amountMinor / months;
    a.n += 1;
    acc.set(cur, a);
  }
  return [...acc.entries()].map(([currency, a]) => ({ currency, amountMinor: Math.round(a.sum), subscriptions: a.n })).sort((x, y) => y.subscriptions - x.subscriptions || x.currency.localeCompare(y.currency));
}

/** Churn rate for a period: churned ÷ (still active + churned). */
export function churnRate(churned: number, activeNow: number) {
  const base = churned + activeNow;
  return base ? churned / base : 0;
}

/** Expected applications by now (target pro-rated over the employee's working hours). */
export function proratedExpected(target: number, minutesNow: number, startMinutes: number, hours: number) {
  if (target <= 0) return 0;
  const span = Math.max(1, hours * 60);
  return target * clamp((minutesNow - startMinutes) / span, 0, 1);
}

export type Rag = "done" | "green" | "amber" | "red" | "off";

/** F10 colours: green ≥ 100% of the pro-rated target, amber 60–99%, red < 60%. */
export function ragFor(applied: number, target: number, expected: number): Rag {
  if (target <= 0) return "off";
  if (applied >= target) return "done";
  if (expected <= 0) return "green";
  const r = applied / expected;
  if (r >= 1) return "green";
  if (r >= 0.6) return "amber";
  return "red";
}

export const isBehind = (r: Rag) => r === "amber" || r === "red";

type Schedule = { days?: number[]; startTime?: string; hours?: number };
export function readSchedule(json: unknown): { days: number[]; startTime: string; hours: number } {
  const s = (json ?? {}) as Schedule;
  return {
    days: Array.isArray(s.days) && s.days.length ? s.days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : [1, 2, 3, 4, 5],
    startTime: typeof s.startTime === "string" && /^\d{2}:\d{2}$/.test(s.startTime) ? s.startTime : "09:00",
    hours: typeof s.hours === "number" && s.hours > 0 ? s.hours : 9,
  };
}

// ─────────────────────────── Today's targets (F10) ───────────────────────────

export type TargetRow = {
  studentId: string;
  name: string;
  marketCode: string;
  planName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  tz: string;
  target: number;
  applied: number;
  expected: number;
  rag: Rag;
};

/**
 * Today's progress for every student with an ACTIVE subscription. The day
 * boundary is the assigned employee's timezone (market default otherwise);
 * target days follow the student's market working days (SPEC F10).
 * Optionally limited to some students.
 */
export async function todayTargets(now = new Date(), opts: { studentIds?: string[] } = {}): Promise<TargetRow[]> {
  const students = await db.studentProfile.findMany({
    where: {
      user: { deletedAt: null },
      subscriptions: { some: { status: "ACTIVE" } },
      ...(opts.studentIds ? { id: { in: opts.studentIds } } : {}),
    },
    select: {
      id: true,
      user: { select: { name: true } },
      market: { select: { code: true, workingDays: true, defaultTimezone: true } },
      subscriptions: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 1, select: { planPrice: { select: { dailyTarget: true, plan: { select: { name: true } } } } } },
      assignments: {
        where: { isActive: true, type: "PRIMARY" },
        take: 1,
        select: { employee: { select: { id: true, workSchedule: true, user: { select: { name: true, timezone: true } } } } },
      },
    },
  });

  const rows = students.map((s) => {
    const emp = s.assignments[0]?.employee ?? null;
    const tz = emp?.user.timezone ?? s.market.defaultTimezone;
    const sched = readSchedule(emp?.workSchedule);
    const working = s.market.workingDays.includes(isoWeekday(now, tz));
    const target = working ? (s.subscriptions[0]?.planPrice.dailyTarget ?? 0) : 0;
    const expected = proratedExpected(target, minutesIntoDay(now, tz), hhmmToMinutes(sched.startTime), sched.hours);
    return {
      studentId: s.id,
      name: s.user.name,
      marketCode: s.market.code,
      planName: s.subscriptions[0]?.planPrice.plan.name ?? null,
      employeeId: emp?.id ?? null,
      employeeName: emp?.user.name ?? null,
      tz,
      target,
      applied: 0,
      expected,
      rag: "off" as Rag,
    };
  });

  // One aggregate per distinct timezone (usually 1–3).
  const byTz = new Map<string, string[]>();
  for (const r of rows) byTz.set(r.tz, [...(byTz.get(r.tz) ?? []), r.studentId]);
  const counts = new Map<string, number>();
  await Promise.all(
    [...byTz.entries()].map(async ([tz, ids]) => {
      const { start, end } = dayRangeInTz(now, tz);
      const g = await db.jobApplication.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, appliedAt: { gte: start, lt: end } }, _count: { _all: true } });
      for (const x of g) counts.set(x.studentId, x._count._all);
    }),
  );
  for (const r of rows) {
    r.applied = counts.get(r.studentId) ?? 0;
    r.rag = ragFor(r.applied, r.target, r.expected);
  }
  return rows.sort((a, b) => a.applied / Math.max(1, a.expected || a.target || 1) - b.applied / Math.max(1, b.expected || b.target || 1) || a.name.localeCompare(b.name));
}

/** Students behind their pro-rated target right now (amber or red). */
export async function belowTargetStudents(now = new Date()) {
  return (await todayTargets(now)).filter((r) => isBehind(r.rag));
}

// ─────────────────────────── Overview (SPEC §11) ───────────────────────────

export async function getMrr() {
  const subs = await db.subscription.findMany({
    where: { status: "ACTIVE", student: { user: { deletedAt: null } } },
    select: { planPrice: { select: { amountMinor: true, currency: true, interval: true } } },
  });
  return mrrByCurrency(subs.map((s) => s.planPrice));
}

function monthStartKey(now: Date, tz: string) {
  return `${dayKey(now, tz).slice(0, 7)}-01`;
}

/** Monday of the current week (ISO) as a day key. */
function weekStartKey(now: Date, tz: string) {
  const key = dayKey(now, tz);
  return addDayKey(key, -(isoWeekday(now, tz) - 1));
}

/** Students whose subscription ended (CANCELED/EXPIRED) this month and who have no active subscription now. */
export async function churnThisMonth(now = new Date(), tz = "UTC") {
  const start = startOfDayInTz(monthStartKey(now, tz), tz);
  const [churnedRows, activeNow] = await Promise.all([
    db.studentProfile.count({
      where: {
        subscriptions: { some: { status: { in: ["CANCELED", "EXPIRED"] }, updatedAt: { gte: start } }, none: { status: "ACTIVE" } },
      },
    }),
    db.studentProfile.count({ where: { user: { deletedAt: null }, subscriptions: { some: { status: "ACTIVE" } } } }),
  ]);
  return { churned: churnedRows, activeNow, rate: churnRate(churnedRows, activeNow) };
}

export async function getOverview(viewerTz: string, now = new Date()) {
  const weekStart = startOfDayInTz(weekStartKey(now, viewerTz), viewerTz);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400e3);
  const monthStart = startOfDayInTz(monthStartKey(now, viewerTz), viewerTz);

  const [mrr, churn, targets, newStudentsRows, interviewsWeek, offersRows, clockedIn, pendingLeave, awaiting, newLeads, totalStudents] = await Promise.all([
    getMrr(),
    churnThisMonth(now, viewerTz),
    todayTargets(now),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM (
        SELECT "studentId", MIN("paidAt") AS first FROM "Payment"
        WHERE status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED') AND "paidAt" IS NOT NULL
        GROUP BY "studentId"
      ) f WHERE f.first >= ${weekStart}`,
    db.interview.count({ where: { scheduledAt: { gte: weekStart, lt: weekEnd } } }),
    db.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT "applicationId")::bigint AS n FROM "ApplicationEvent" WHERE "toStatus" = 'OFFER' AND "at" >= ${monthStart}`,
    db.workSession.findMany({
      where: { endedAt: null },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true, employee: { select: { id: true, user: { select: { name: true } } } }, breaks: { where: { endedAt: null }, select: { id: true } } },
    }),
    db.leaveRequest.count({ where: { status: "PENDING" } }),
    db.studentProfile.count({ where: { assignmentQueue: "AWAITING", user: { deletedAt: null } } }),
    db.lead.count({ where: { status: "NEW" } }),
    db.studentProfile.count({ where: { user: { deletedAt: null } } }),
  ]);

  const appliedToday = targets.reduce((s, r) => s + r.applied, 0);
  const targetToday = targets.reduce((s, r) => s + r.target, 0);
  const behind = targets.filter((r) => isBehind(r.rag));

  return {
    activeStudents: churn.activeNow,
    totalStudents,
    mrr,
    newStudentsWeek: Number(newStudentsRows[0]?.n ?? 0),
    churn,
    appliedToday,
    targetToday,
    behind,
    interviewsWeek,
    offersMonth: Number(offersRows[0]?.n ?? 0),
    clockedIn: clockedIn.map((c) => ({ employeeId: c.employee.id, name: c.employee.user.name, since: c.startedAt, onBreak: c.breaks.length > 0 })),
    pendingLeave,
    awaiting,
    newLeads,
  };
}

// ─────────────────────────── Charts ───────────────────────────

/** Applications per day for the last `days` days (viewer timezone), zero-filled. */
export async function applicationsPerDay(viewerTz: string, days = 30, now = new Date()) {
  const todayKey = dayKey(now, viewerTz);
  const fromKey = addDayKey(todayKey, -(days - 1));
  const from = startOfDayInTz(fromKey, viewerTz);
  const rows = await db.$queryRaw<{ d: string; n: bigint }[]>`
    SELECT to_char(("appliedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${viewerTz}, 'YYYY-MM-DD') AS d, COUNT(*)::bigint AS n
    FROM "JobApplication" WHERE "appliedAt" >= ${from} GROUP BY 1`;
  const m = new Map(rows.map((r) => [r.d, Number(r.n)]));
  const out: { day: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const k = addDayKey(fromKey, i);
    out.push({ day: k, count: m.get(k) ?? 0 });
  }
  return out;
}

export function lastMonths(now: Date, tz: string, n: number) {
  const key = dayKey(now, tz);
  let y = Number(key.slice(0, 4));
  let mo = Number(key.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(mo).padStart(2, "0")}`);
    mo -= 1;
    if (mo === 0) {
      mo = 12;
      y -= 1;
    }
  }
  return out;
}

/** Net revenue (paid − refunded) per month for the last `months` months, one series per currency. */
export async function revenuePerMonth(viewerTz: string, months = 12, now = new Date()) {
  const keys = lastMonths(now, viewerTz, months);
  const from = startOfDayInTz(`${keys[0]}-01`, viewerTz);
  const rows = await db.$queryRaw<{ m: string; currency: string; gross: bigint; refunded: bigint; n: bigint }[]>`
    SELECT to_char(("paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${viewerTz}, 'YYYY-MM') AS m, currency,
           SUM("amountMinor")::bigint AS gross, SUM("refundedMinor")::bigint AS refunded, COUNT(*)::bigint AS n
    FROM "Payment"
    WHERE status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED') AND "paidAt" >= ${from}
    GROUP BY 1, 2`;
  const currencies = [...new Set(rows.map((r) => r.currency))].sort();
  return currencies.map((currency) => ({
    currency,
    points: keys.map((month) => {
      const r = rows.find((x) => x.m === month && x.currency === currency);
      return { month, netMinor: r ? Number(r.gross) - Number(r.refunded) : 0, grossMinor: r ? Number(r.gross) : 0, refundedMinor: r ? Number(r.refunded) : 0, payments: r ? Number(r.n) : 0 };
    }),
  }));
}

/** Funnel for the last `days` days: leads → student sign-ups → first payment. */
export async function funnel(days = 30, now = new Date()) {
  const from = new Date(now.getTime() - days * 86400e3);
  const [leads, signups, paid] = await Promise.all([
    db.lead.count({ where: { createdAt: { gte: from } } }),
    db.studentProfile.count({ where: { createdAt: { gte: from } } }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM (
        SELECT "studentId", MIN("paidAt") AS first FROM "Payment"
        WHERE status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED') AND "paidAt" IS NOT NULL GROUP BY 1
      ) f WHERE f.first >= ${from}`,
  ]);
  return { leads, signups, paid: Number(paid[0]?.n ?? 0) };
}

