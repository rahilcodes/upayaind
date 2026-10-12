import "server-only";
import type { ApplicationStatus, Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { addDayKey, dateOnly, dayKey, dayRangeInTz, eachDayKey, startOfDayInTz, weekdayOfKey } from "@/lib/dates";
import { firstName } from "@/lib/utils";

/**
 * Student dashboard (SPEC F6) metrics.
 *
 * Day boundary (F10): a "day" is a calendar day in the timezone of the
 * student's assigned (primary) employee — the same boundary the workspace and
 * StudentDay counters use (D-033). Without an assignment we fall back to the
 * student's own timezone. Target days follow the student's MARKET working days
 * (Market.workingDays, ISO weekdays) minus market holidays (Holiday.region =
 * market code); the target is 0 on other days and while the subscription
 * isn't ACTIVE.
 *
 * Response rate = share of (non-draft) applications whose status is beyond
 * APPLIED / VIEWED / NO_RESPONSE.
 */

type Actor = { id: string; role: Role };

export const NO_RESPONSE_STATUSES: ApplicationStatus[] = ["APPLIED", "VIEWED", "NO_RESPONSE"];
export const SUCCESS_STATUSES: ApplicationStatus[] = ["OFFER", "HIRED"];

export async function studentContext(user: Actor) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      targetTitles: true,
      user: { select: { name: true, timezone: true } },
      market: { select: { code: true, workingDays: true, locale: true } },
    },
  });
  if (!s) throw new ForbiddenError();
  return s;
}

/** Pure: target for one day key. */
export function targetForDay(key: string, opts: { workingDays: number[]; holidays: Set<string>; dailyTarget: number; active: boolean }) {
  if (!opts.active || opts.dailyTarget <= 0) return 0;
  if (!opts.workingDays.includes(weekdayOfKey(key))) return 0;
  if (opts.holidays.has(key)) return 0;
  return opts.dailyTarget;
}

/** Pure: response rate in % (0 when there are no applications). */
export function responseRate(counts: Partial<Record<ApplicationStatus, number>>) {
  let total = 0;
  let responded = 0;
  for (const [status, n] of Object.entries(counts) as [ApplicationStatus, number][]) {
    if (status === "DRAFT") continue;
    total += n;
    if (!NO_RESPONSE_STATUSES.includes(status)) responded += n;
  }
  return { total, responded, rate: total ? Math.round((responded / total) * 100) : 0 };
}

/** Primary (or cover) employee currently assigned; first name only for students (SPEC §20). */
export async function currentSpecialist(studentId: string, now = new Date()) {
  const a = await db.assignment.findMany({
    where: { studentId, isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    orderBy: { startsAt: "desc" },
    select: { type: true, employee: { select: { user: { select: { name: true, timezone: true, avatarKey: true } } } } },
  });
  const primary = a.find((x) => x.type === "PRIMARY");
  const cover = a.find((x) => x.type === "COVER");
  if (!primary && !cover) return null;
  const pick = primary ?? cover!;
  return {
    firstName: firstName(pick.employee.user.name),
    timezone: pick.employee.user.timezone,
    hasAvatar: Boolean(pick.employee.user.avatarKey),
    cover: cover && primary ? { firstName: firstName(cover.employee.user.name) } : null,
  };
}

export async function planState(studentId: string, now = new Date()) {
  const subs = await db.subscription.findMany({
    where: { studentId, status: { not: "PENDING_PAYMENT" } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { status: true, currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, provider: true, planPrice: { select: { dailyTarget: true, interval: true, plan: { select: { name: true } } } } },
  });
  const pending = await db.subscription.count({ where: { studentId, status: "PENDING_PAYMENT" } });
  const s = subs.find((x) => x.status === "ACTIVE") ?? subs[0] ?? null;
  if (!s) return { hasPlan: false as const, pendingPayment: pending > 0 };
  const start = s.currentPeriodStart;
  const end = s.currentPeriodEnd;
  const totalDays = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400e3)) : null;
  const dayNumber = start && totalDays ? Math.min(totalDays, Math.max(1, Math.floor((now.getTime() - start.getTime()) / 86400e3) + 1)) : null;
  const ends = s.cancelAtPeriodEnd || s.planPrice.interval === "ONE_TIME" || s.provider === "MANUAL";
  return {
    hasPlan: true as const,
    pendingPayment: pending > 0,
    active: s.status === "ACTIVE",
    status: s.status,
    planName: s.planPrice.plan.name,
    dailyTarget: s.planPrice.dailyTarget,
    periodEnd: end,
    dayNumber,
    totalDays,
    endsAtPeriodEnd: ends,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

/** Everything /app needs, in one call. `now` is injectable for tests. */
export async function getDashboard(user: Actor, now = new Date()) {
  const s = await studentContext(user);
  const studentId = s.id;
  const [specialist, plan] = await Promise.all([currentSpecialist(studentId, now), planState(studentId, now)]);
  const tz = specialist?.timezone ?? s.user.timezone;
  const today = dayRangeInTz(now, tz);
  const fromKey = addDayKey(today.key, -29);
  const from = startOfDayInTz(fromKey, tz);
  // ISO week (Mon–Sun) containing today, in the same zone.
  const weekStartKey = addDayKey(today.key, -(weekdayOfKey(today.key) - 1));
  const weekStart = startOfDayInTz(weekStartKey, tz);

  const holidays = await db.holiday.findMany({ where: { region: s.market.code, date: { gte: dateOnly(fromKey), lte: dateOnly(addDayKey(today.key, 1)) } }, select: { date: true } });
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const active = plan.hasPlan && plan.active;
  const dailyTarget = plan.hasPlan ? plan.dailyTarget : 0;
  const targetOpts = { workingDays: s.market.workingDays, holidays: holidaySet, dailyTarget, active };

  const upcomingWhere = { scheduledAt: { gte: new Date(now.getTime() - 60 * 60e3) }, application: { studentId } };
  const [recentApplied, statusGroups, upcomingInterviews, upcomingCount, latest, success] = await Promise.all([
    db.jobApplication.findMany({ where: { studentId, status: { not: "DRAFT" }, appliedAt: { gte: from < weekStart ? from : weekStart, lt: today.end } }, select: { appliedAt: true } }),
    db.jobApplication.groupBy({ by: ["status"], where: { studentId }, _count: { _all: true } }),
    db.interview.findMany({
      where: upcomingWhere,
      orderBy: { scheduledAt: "asc" },
      take: 5,
      select: { id: true, scheduledAt: true, timezone: true, round: true, mode: true, meetingLink: true, application: { select: { id: true, companyName: true, companyDomain: true, jobTitle: true } } },
    }),
    db.interview.count({ where: upcomingWhere }),
    db.jobApplication.findMany({
      where: { studentId, status: { not: "DRAFT" } },
      orderBy: [{ appliedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      take: 8,
      select: { id: true, companyName: true, companyDomain: true, jobTitle: true, location: true, jobUrl: true, status: true, appliedAt: true, resumeVersionId: true },
    }),
    db.jobApplication.findFirst({
      where: { studentId, status: { in: SUCCESS_STATUSES } },
      orderBy: { lastStatusAt: "desc" },
      select: { id: true, status: true, companyName: true, jobTitle: true, lastStatusAt: true },
    }),
  ]);

  const perDay = new Map<string, number>();
  for (const a of recentApplied) {
    if (!a.appliedAt) continue;
    const k = dayKey(a.appliedAt, tz);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const chart = eachDayKey(fromKey, today.key).map((k) => ({ day: k, applied: perDay.get(k) ?? 0, target: targetForDay(k, targetOpts), workingDay: targetForDay(k, { ...targetOpts, active: true, dailyTarget: 1 }) > 0 }));
  const appliedToday = perDay.get(today.key) ?? 0;
  const thisWeek = eachDayKey(weekStartKey, today.key).reduce((n, k) => n + (perDay.get(k) ?? 0), 0);
  const counts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Partial<Record<ApplicationStatus, number>>;
  const rr = responseRate(counts);

  // Celebrate offers/hires for 60 days after the status change.
  const celebrate = success && now.getTime() - success.lastStatusAt.getTime() < 60 * 86400e3 ? success : null;

  return {
    studentId,
    name: s.user.name,
    studentTimezone: s.user.timezone,
    dayTimezone: tz,
    todayKey: today.key,
    today: { applied: appliedToday, target: targetForDay(today.key, targetOpts), workingDay: chart[chart.length - 1]!.workingDay },
    thisWeek,
    total: rr.total,
    interviewsUpcoming: upcomingCount,
    response: rr,
    chart,
    chartTarget: active ? dailyTarget : 0,
    latest,
    upcomingInterviews,
    plan,
    specialist,
    celebrate,
  };
}
