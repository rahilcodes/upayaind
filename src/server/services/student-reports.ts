import "server-only";
import { createTranslator } from "next-intl";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import coreMessages from "@/i18n/messages/en/core.json";
import studentMessages from "@/i18n/messages/en/student.json";
import { addDayKey, dateOnly, dayKey, dayRangeInTz, isoWeekday, startOfDayInTz, weekdayOfKey } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { firstName } from "@/lib/utils";
import { storeGenerated } from "./files";
import { notify } from "./notify";
import { responseRate } from "./student-dashboard";
import { renderWeeklyReportPdf } from "./weekly-report-pdf";

/**
 * Student digests (SPEC F13, D-112).
 *
 * - `daily_digest`: 19:00 in the student's own time zone on the market's working
 *   days, only when ≥ 1 application was logged that day. Idempotent per day via
 *   `StudentProfile.lastDigestKey` (claimed atomically before sending).
 * - `weekly_report`: Monday 09:00 student time: last ISO week's applications,
 *   counts by status, interviews, response rate and next week's interviews, as a
 *   branded PDF (stored with purpose `report`, downloadable from /app/reports)
 *   attached to the email. Idempotent via `StudentProfile.lastWeeklyReportKey`.
 * - `weekly_summary_admin`: Monday 09:00 in each manager's time zone (once per
 *   week per manager, guarded by the existing bell notification).
 *
 * Both jobs run from one hourly cron; `now` is injectable for tests.
 */

export const DIGEST_HOUR = 19;
export const WEEKLY_HOUR = 9;

/** Pure: is the daily digest due right now for this student? */
export function digestDue(now: Date, tz: string, opts: { workingDays: number[]; holidays?: Set<string>; lastDigestKey: string | null }) {
  const key = dayKey(now, tz);
  if (opts.lastDigestKey === key) return false;
  if (Number(hourIn(now, tz)) !== DIGEST_HOUR) return false;
  if (!opts.workingDays.includes(weekdayOfKey(key))) return false;
  if (opts.holidays?.has(key)) return false;
  return true;
}

/** Pure: is the weekly report due right now (Monday 09:00 local)? */
export function weeklyDue(now: Date, tz: string, lastWeeklyReportKey: string | null) {
  const key = dayKey(now, tz);
  if (lastWeeklyReportKey === key) return false;
  return isoWeekday(now, tz) === 1 && hourIn(now, tz) === WEEKLY_HOUR;
}

function hourIn(now: Date, tz: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now));
}

const STUDENT_SELECT = {
  id: true,
  lastDigestKey: true,
  lastWeeklyReportKey: true,
  user: { select: { id: true, name: true, timezone: true, status: true, deletedAt: true } },
  market: { select: { code: true, workingDays: true, locale: true } },
} as const;

/** Hourly: send `daily_digest` to every student whose local time is 19:xx today. Returns the number sent. */
export async function runDailyDigest(now = new Date()) {
  const students = await db.studentProfile.findMany({
    where: { user: { status: "ACTIVE", deletedAt: null }, onboardingCompletedAt: { not: null } },
    select: STUDENT_SELECT,
  });
  let sent = 0;
  for (const s of students) {
    const tz = s.user.timezone;
    const todayKey = dayKey(now, tz);
    if (!digestDue(now, tz, { workingDays: s.market.workingDays, lastDigestKey: s.lastDigestKey })) continue;
    const holiday = await db.holiday.findFirst({ where: { region: s.market.code, date: dateOnly(todayKey) }, select: { id: true } });
    if (holiday) continue;
    const range = dayRangeInTz(now, tz);
    const apps = await db.jobApplication.findMany({
      where: { studentId: s.id, status: { not: "DRAFT" }, appliedAt: { gte: range.start, lt: range.end } },
      orderBy: { appliedAt: "desc" },
      select: { companyName: true },
    });
    if (apps.length === 0) continue;
    // Claim the day before sending so a concurrent run can't send twice.
    const claimed = await db.studentProfile.updateMany({ where: { id: s.id, OR: [{ lastDigestKey: null }, { lastDigestKey: { not: todayKey } }] }, data: { lastDigestKey: todayKey } });
    if (claimed.count !== 1) continue;
    const target = await dailyTargetFor(s.id);
    const companies = [...new Set(apps.map((a) => a.companyName))].slice(0, 4).join(", ");
    await notify(s.user.id, "daily_digest", { count: apps.length, target: target || apps.length, companies });
    sent++;
  }
  return sent;
}

async function dailyTargetFor(studentId: string) {
  const sub = await db.subscription.findFirst({ where: { studentId, status: "ACTIVE" }, select: { planPrice: { select: { dailyTarget: true } } } });
  return sub?.planPrice.dailyTarget ?? 0;
}

/** Data + PDF for one student's last-week report (also used by tests). */
export async function buildWeeklyReport(studentId: string, now = new Date()) {
  const s = await db.studentProfile.findUniqueOrThrow({ where: { id: studentId }, select: STUDENT_SELECT });
  const tz = s.user.timezone;
  const todayKey = dayKey(now, tz);
  const thisMondayKey = addDayKey(todayKey, -(weekdayOfKey(todayKey) - 1));
  const lastMondayKey = addDayKey(thisMondayKey, -7);
  const weekStart = startOfDayInTz(lastMondayKey, tz);
  const weekEnd = startOfDayInTz(thisMondayKey, tz);
  const nextWeekEnd = startOfDayInTz(addDayKey(thisMondayKey, 7), tz);

  const [apps, interviewsLastWeek, nextInterviews, allGroups] = await Promise.all([
    db.jobApplication.findMany({
      where: { studentId, status: { not: "DRAFT" }, appliedAt: { gte: weekStart, lt: weekEnd } },
      orderBy: { appliedAt: "asc" },
      select: { companyName: true, jobTitle: true, location: true, appliedAt: true, status: true },
    }),
    db.interview.count({ where: { application: { studentId }, scheduledAt: { gte: weekStart, lt: weekEnd } } }),
    db.interview.findMany({
      where: { application: { studentId }, scheduledAt: { gte: weekEnd, lt: nextWeekEnd } },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, round: true, mode: true, application: { select: { companyName: true, jobTitle: true } } },
    }),
    db.jobApplication.groupBy({ by: ["status"], where: { studentId, status: { not: "DRAFT" } }, _count: { _all: true } }),
  ]);
  const counts: Partial<Record<ApplicationStatus, number>> = {};
  for (const g of allGroups) counts[g.status] = g._count._all;
  const rr = responseRate(counts);
  const t = createTranslator({ locale: "en", messages: studentMessages, namespace: "student.weeklyReport" });
  const statusLabels = (coreMessages as { status: Record<string, string> }).status;
  const byStatus = new Map<string, number>();
  for (const a of apps) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);

  const data = {
    studentName: firstName(s.user.name),
    timezone: tz,
    locale: s.market.locale,
    weekStart,
    weekEnd,
    generatedAt: now,
    applications: apps,
    countsByStatus: [...byStatus.entries()].map(([status, count]) => ({ status, label: statusLabels[status] ?? status, count })),
    interviewsLastWeek,
    responseRate: rr.rate,
    totalApplications: rr.total,
    nextInterviews: nextInterviews.map((i) => ({ companyName: i.application.companyName, jobTitle: i.application.jobTitle, scheduledAt: i.scheduledAt, round: i.round, mode: i.mode })),
    statusLabels,
    labels: {
      ...Object.fromEntries(
        (["title", "applications", "interviews", "responseRate", "total", "byStatus", "applicationsTitle", "company", "role", "applied", "status", "noApplications", "nextWeek", "noInterviews"] as const).map((k) => [k, t(k)]),
      ),
      greeting: t("greeting", { name: firstName(s.user.name) }),
      footer: t("footer", { date: formatInTz(now, tz, "d MMM yyyy, h:mm a") }),
    },
  };
  const pdf = await renderWeeklyReportPdf(data);
  const file = await storeGenerated({
    key: `reports/${studentId}/weekly-${lastMondayKey}.pdf`,
    buffer: pdf,
    mime: "application/pdf",
    ownerUserId: s.user.id,
    studentId,
    purpose: "report",
    filename: `UpayaInd weekly report ${lastMondayKey}.pdf`,
  });
  return { data, pdf, file, weekKey: lastMondayKey, student: s };
}

/** Hourly: Monday 09:xx local → weekly report (students) and weekly summary (managers). Returns counts. */
export async function runWeeklyReports(now = new Date()) {
  const students = await db.studentProfile.findMany({
    where: { user: { status: "ACTIVE", deletedAt: null }, onboardingCompletedAt: { not: null } },
    select: STUDENT_SELECT,
  });
  let sent = 0;
  for (const s of students) {
    const tz = s.user.timezone;
    if (!weeklyDue(now, tz, s.lastWeeklyReportKey)) continue;
    const todayKey = dayKey(now, tz);
    const everApplied = await db.jobApplication.count({ where: { studentId: s.id, status: { not: "DRAFT" } } });
    const claimed = await db.studentProfile.updateMany({ where: { id: s.id, OR: [{ lastWeeklyReportKey: null }, { lastWeeklyReportKey: { not: todayKey } }] }, data: { lastWeeklyReportKey: todayKey } });
    if (claimed.count !== 1) continue;
    if (everApplied === 0) continue; // nothing to report yet; the day is still marked so we don't re-check hourly
    try {
      const r = await buildWeeklyReport(s.id, now);
      await notify(
        s.user.id,
        "weekly_report",
        { count: r.data.applications.length, interviews: r.data.interviewsLastWeek, responseRate: r.data.responseRate },
        { attachments: [{ filename: r.file.key.split("/").pop()!, content: r.pdf }] },
      );
      sent++;
    } catch (e) {
      console.error("[weekly-report] failed for student", s.id, e);
    }
  }
  const admins = await runWeeklyAdminSummary(now);
  return { students: sent, admins };
}

/** Monday 09:xx in each manager's zone: one `weekly_summary_admin` per manager per week. */
export async function runWeeklyAdminSummary(now = new Date()) {
  const managers = await db.user.findMany({ where: { role: { in: ["MANAGER", "ADMIN"] }, status: "ACTIVE", deletedAt: null }, select: { id: true, timezone: true } });
  const due = managers.filter((m) => isoWeekday(now, m.timezone) === 1 && hourIn(now, m.timezone) === WEEKLY_HOUR);
  if (!due.length) return 0;
  const since = new Date(now.getTime() - 6 * 86400e3);
  const already = new Set((await db.notification.findMany({ where: { type: "weekly_summary_admin", userId: { in: due.map((m) => m.id) }, createdAt: { gte: since } }, select: { userId: true } })).map((n) => n.userId));
  const targets = due.filter((m) => !already.has(m.id));
  if (!targets.length) return 0;
  // Previous ISO week in UTC (managers may sit in different zones; the week boundary is a convention here).
  const todayUtc = dayKey(now, "UTC");
  const mondayUtc = addDayKey(todayUtc, -(weekdayOfKey(todayUtc) - 1));
  const start = dateOnly(addDayKey(mondayUtc, -7));
  const end = dateOnly(mondayUtc);
  const [applications, interviews, offers] = await Promise.all([
    db.jobApplication.count({ where: { status: { not: "DRAFT" }, appliedAt: { gte: start, lt: end } } }),
    db.interview.count({ where: { scheduledAt: { gte: start, lt: end } } }),
    db.applicationEvent.count({ where: { toStatus: { in: ["OFFER", "HIRED"] }, at: { gte: start, lt: end } } }),
  ]);
  await Promise.all(targets.map((m) => notify(m.id, "weekly_summary_admin", { applications, interviews, offers })));
  return targets.length;
}

/** /app/reports: the student's stored weekly reports (newest first). */
export async function listStudentReports(studentId: string) {
  return db.fileObject.findMany({
    where: { studentId, purpose: "report" },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { id: true, filename: true, size: true, createdAt: true, key: true },
  });
}
