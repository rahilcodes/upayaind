import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { addDayKey, dayKey, startOfDayInTz } from "@/lib/dates";
import { avgMinutes } from "./employees";

/**
 * Reports (SPEC §11 Reports, M10): revenue, delivery, staff performance,
 * response/interview/offer rates by market and role family, retention cohorts.
 * Every report returns a flat table (`columns` + `rows`) so the page, CSV and
 * XLSX exports share one shape. Money columns carry their currency; amounts in
 * different currencies are never added together.
 */

export const REPORT_KEYS = ["revenue", "delivery-students", "delivery-employees", "staff", "rates", "retention"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export type ColType = "text" | "int" | "pct" | "money" | "minutes" | "decimal";
export type Column = { key: string; type: ColType };
export type Row = Record<string, string | number | null>;
export type ReportTable = { key: ReportKey; columns: Column[]; rows: Row[] };

export const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  market: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().catch(undefined),
});
export type Range = { fromKey: string; toKey: string; start: Date; end: Date; market?: string; tz: string };

/** Default range: the last 30 days (viewer timezone). `to` is inclusive. */
export function resolveRange(raw: Record<string, string | undefined>, tz: string, now = new Date()): Range {
  const f = rangeSchema.parse(raw);
  const today = dayKey(now, tz);
  let toKey = f.to ?? today;
  let fromKey = f.from ?? addDayKey(toKey, -29);
  if (fromKey > toKey) [fromKey, toKey] = [toKey, fromKey];
  // Cap at ~2 years to keep queries bounded.
  if (fromKey < addDayKey(toKey, -731)) fromKey = addDayKey(toKey, -731);
  return { fromKey, toKey, start: startOfDayInTz(fromKey, tz), end: startOfDayInTz(addDayKey(toKey, 1), tz), market: f.market, tz };
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

// ─────────────────────────── Pure helpers (unit-tested) ───────────────────────────

const STOP = new Set(["senior", "sr", "junior", "jr", "lead", "principal", "staff", "associate", "entry", "level", "mid", "the", "a", "an", "of", "and", "i", "ii", "iii", "iv"]);

/** Role family = the first meaningful keyword of the student's first target title ("Senior Data Analyst" → "data"). */
export function roleFamily(titles: string[] | null | undefined): string {
  const t = titles?.find((x) => x && x.trim());
  if (!t) return "unspecified";
  const words = t
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s/-]/g, " ")
    .split(/[\s/-]+/)
    .filter(Boolean);
  return words.find((w) => !STOP.has(w)) ?? words[0] ?? "unspecified";
}

/** Add `n` calendar months to a UTC instant (clamped to month end). */
export function addMonthsUtc(d: Date, n: number) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
}

/**
 * Retention cohorts: students grouped by the month of their first payment;
 * retained at +k months when they were paid through (first + k months).
 * Months that haven't happened yet are null.
 */
export function cohortRetention(students: { firstPaidAt: Date; paidThrough: Date | null }[], now = new Date(), horizons = [1, 2, 3]) {
  const by = new Map<string, { firstPaidAt: Date; paidThrough: Date | null }[]>();
  for (const s of students) {
    const k = s.firstPaidAt.toISOString().slice(0, 7);
    by.set(k, [...(by.get(k) ?? []), s]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohort, list]) => {
      const out: { cohort: string; size: number; retention: (number | null)[] } = { cohort, size: list.length, retention: [] };
      for (const h of horizons) {
        const eligible = list.filter((s) => addMonthsUtc(s.firstPaidAt, h) <= now);
        if (!eligible.length) {
          out.retention.push(null);
          continue;
        }
        const kept = eligible.filter((s) => s.paidThrough && s.paidThrough >= addMonthsUtc(s.firstPaidAt, h)).length;
        out.retention.push(pct(kept, eligible.length));
      }
      return out;
    });
}

// ─────────────────────────── Reports ───────────────────────────

export async function revenueReport(r: Range): Promise<ReportTable> {
  const rows = await db.$queryRaw<{ m: string; currency: string; gross: bigint; refunded: bigint; tax: bigint; n: bigint; students: bigint }[]>`
    SELECT to_char((p."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ${r.tz}, 'YYYY-MM') AS m, p.currency,
           SUM(p."amountMinor")::bigint AS gross, SUM(p."refundedMinor")::bigint AS refunded, SUM(p."taxMinor")::bigint AS tax,
           COUNT(*)::bigint AS n, COUNT(DISTINCT p."studentId")::bigint AS students
    FROM "Payment" p
    JOIN "StudentProfile" sp ON sp.id = p."studentId"
    JOIN "Market" mk ON mk.id = sp."marketId"
    WHERE p.status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED') AND p."paidAt" >= ${r.start} AND p."paidAt" < ${r.end}
      AND (${r.market ?? null}::text IS NULL OR mk.code = ${r.market ?? null})
    GROUP BY 1, 2 ORDER BY 1 DESC, 2`;
  return {
    key: "revenue",
    columns: [
      { key: "month", type: "text" },
      { key: "currency", type: "text" },
      { key: "payments", type: "int" },
      { key: "students", type: "int" },
      { key: "gross", type: "money" },
      { key: "refunded", type: "money" },
      { key: "net", type: "money" },
      { key: "tax", type: "money" },
    ],
    rows: rows.map((x) => ({ month: x.m, currency: x.currency, payments: Number(x.n), students: Number(x.students), gross: Number(x.gross), refunded: Number(x.refunded), net: Number(x.gross) - Number(x.refunded), tax: Number(x.tax) })),
  };
}

/** Target adherence per student from StudentDay rows in range (working days with a target). */
export async function deliveryByStudent(r: Range): Promise<ReportTable> {
  const rows = await db.$queryRaw<{ id: string; name: string; market: string; days: bigint; met: bigint; applied: bigint; target: bigint }[]>`
    SELECT sp.id, u.name, mk.code AS market, COUNT(*)::bigint AS days,
           COUNT(*) FILTER (WHERE sd.applied >= sd.target)::bigint AS met,
           SUM(sd.applied)::bigint AS applied, SUM(sd.target)::bigint AS target
    FROM "StudentDay" sd
    JOIN "StudentProfile" sp ON sp.id = sd."studentId"
    JOIN "User" u ON u.id = sp."userId"
    JOIN "Market" mk ON mk.id = sp."marketId"
    WHERE sd.date >= ${r.fromKey}::date AND sd.date <= ${r.toKey}::date AND sd.target > 0
      AND (${r.market ?? null}::text IS NULL OR mk.code = ${r.market ?? null})
    GROUP BY 1, 2, 3 ORDER BY (SUM(sd.applied)::float / NULLIF(SUM(sd.target), 0)) ASC NULLS LAST, 2`;
  return {
    key: "delivery-students",
    columns: [
      { key: "student", type: "text" },
      { key: "market", type: "text" },
      { key: "days", type: "int" },
      { key: "daysMet", type: "int" },
      { key: "daysMetPct", type: "pct" },
      { key: "applied", type: "int" },
      { key: "target", type: "int" },
      { key: "adherence", type: "pct" },
    ],
    rows: rows.map((x) => ({ id: x.id, student: x.name, market: x.market, days: Number(x.days), daysMet: Number(x.met), daysMetPct: pct(Number(x.met), Number(x.days)), applied: Number(x.applied), target: Number(x.target), adherence: pct(Number(x.applied), Number(x.target)) })),
  };
}

/** Target adherence per employee: each StudentDay is credited to the primary assignee on that date. */
export async function deliveryByEmployee(r: Range): Promise<ReportTable> {
  const rows = await db.$queryRaw<{ id: string; name: string; code: string; students: bigint; days: bigint; met: bigint; applied: bigint; target: bigint }[]>`
    SELECT ep.id, u.name, ep."employeeCode" AS code, COUNT(DISTINCT sd."studentId")::bigint AS students, COUNT(*)::bigint AS days,
           COUNT(*) FILTER (WHERE sd.applied >= sd.target)::bigint AS met,
           SUM(sd.applied)::bigint AS applied, SUM(sd.target)::bigint AS target
    FROM "StudentDay" sd
    JOIN "Assignment" a ON a."studentId" = sd."studentId" AND a.type = 'PRIMARY'
         AND a."startsAt" < (sd.date + INTERVAL '1 day') AND (a."endsAt" IS NULL OR a."endsAt" > sd.date)
    JOIN "EmployeeProfile" ep ON ep.id = a."employeeId"
    JOIN "User" u ON u.id = ep."userId"
    JOIN "StudentProfile" sp ON sp.id = sd."studentId"
    JOIN "Market" mk ON mk.id = sp."marketId"
    WHERE sd.date >= ${r.fromKey}::date AND sd.date <= ${r.toKey}::date AND sd.target > 0
      AND (${r.market ?? null}::text IS NULL OR mk.code = ${r.market ?? null})
    GROUP BY 1, 2, 3 ORDER BY 2`;
  return {
    key: "delivery-employees",
    columns: [
      { key: "employee", type: "text" },
      { key: "code", type: "text" },
      { key: "students", type: "int" },
      { key: "studentDays", type: "int" },
      { key: "daysMet", type: "int" },
      { key: "daysMetPct", type: "pct" },
      { key: "applied", type: "int" },
      { key: "target", type: "int" },
      { key: "adherence", type: "pct" },
    ],
    rows: rows.map((x) => ({ id: x.id, employee: x.name, code: x.code, students: Number(x.students), studentDays: Number(x.days), daysMet: Number(x.met), daysMetPct: pct(Number(x.met), Number(x.days)), applied: Number(x.applied), target: Number(x.target), adherence: pct(Number(x.applied), Number(x.target)) })),
  };
}

const RESPONDED = ["RECRUITER_REPLIED", "ASSESSMENT", "INTERVIEW_SCHEDULED", "INTERVIEWING", "OFFER", "HIRED"];
const INTERVIEWED = ["INTERVIEW_SCHEDULED", "INTERVIEWING", "OFFER", "HIRED"];
const OFFERED = ["OFFER", "HIRED"];

const STAFF_COLUMNS: Column[] = [
  { key: "employee", type: "text" },
  { key: "code", type: "text" },
  { key: "applications", type: "int" },
  { key: "daysWorked", type: "int" },
  { key: "perDay", type: "decimal" },
  { key: "responseRate", type: "pct" },
  { key: "interviews", type: "int" },
  { key: "avgGenToLog", type: "minutes" },
  { key: "activeHours", type: "decimal" },
  { key: "clockedHours", type: "decimal" },
  { key: "statusUpdates", type: "int" },
  { key: "messagesSent", type: "int" },
];

/** Staff performance (F10): applications per worked day, response rate, interviews, gen→log time, hours. */
export async function staffPerformance(r: Range): Promise<ReportTable> {
  const emps = await db.employeeProfile.findMany({
    where: { user: { role: { in: ["EMPLOYEE", "MANAGER"] }, deletedAt: null } },
    orderBy: { user: { name: "asc" } },
    select: { id: true, employeeCode: true, user: { select: { name: true, status: true } } },
  });
  const ids = emps.map((e) => e.id);
  if (!ids.length) return { key: "staff", columns: STAFF_COLUMNS, rows: [] };
  const [apps, days, interviews, gen] = await Promise.all([
    db.$queryRaw<{ employeeId: string; n: bigint; responded: bigint }[]>`
      SELECT a."employeeId", COUNT(*)::bigint AS n,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "ApplicationEvent" e WHERE e."applicationId" = a.id AND e."toStatus"::text = ANY(${RESPONDED})) OR a.status::text = ANY(${RESPONDED}))::bigint AS responded
      FROM "JobApplication" a
      JOIN "StudentProfile" sp ON sp.id = a."studentId" JOIN "Market" mk ON mk.id = sp."marketId"
      WHERE a."appliedAt" >= ${r.start} AND a."appliedAt" < ${r.end} AND a."employeeId" = ANY(${ids})
        AND (${r.market ?? null}::text IS NULL OR mk.code = ${r.market ?? null})
      GROUP BY 1`,
    db.employeeDay.groupBy({
      by: ["employeeId"],
      where: { employeeId: { in: ids }, date: { gte: new Date(`${r.fromKey}T00:00:00Z`), lte: new Date(`${r.toKey}T00:00:00Z`) } },
      _sum: { clockedMinutes: true, activeMinutes: true, statusUpdates: true, messagesSent: true },
      _count: { _all: true },
    }),
    db.$queryRaw<{ employeeId: string; n: bigint }[]>`
      SELECT a."employeeId", COUNT(i.id)::bigint AS n FROM "Interview" i JOIN "JobApplication" a ON a.id = i."applicationId"
      WHERE i."createdAt" >= ${r.start} AND i."createdAt" < ${r.end} AND a."employeeId" = ANY(${ids}) GROUP BY 1`,
    db.jobApplication.findMany({
      where: { employeeId: { in: ids }, appliedAt: { gte: r.start, lt: r.end }, resumeVersion: { kind: "TAILORED" } },
      select: { employeeId: true, appliedAt: true, resumeVersion: { select: { createdAt: true } } },
      take: 50_000,
    }),
  ]);
  const presentDays = await db.employeeDay.groupBy({
    by: ["employeeId"],
    where: { employeeId: { in: ids }, status: { in: ["PRESENT", "HALF_DAY"] }, date: { gte: new Date(`${r.fromKey}T00:00:00Z`), lte: new Date(`${r.toKey}T00:00:00Z`) } },
    _count: { _all: true },
  });
  const a = new Map(apps.map((x) => [x.employeeId, x]));
  const d = new Map(days.map((x) => [x.employeeId, x]));
  const p = new Map(presentDays.map((x) => [x.employeeId, x._count._all]));
  const iv = new Map(interviews.map((x) => [x.employeeId, Number(x.n)]));
  const g = new Map<string, { createdAt: Date; appliedAt: Date | null }[]>();
  for (const x of gen) g.set(x.employeeId, [...(g.get(x.employeeId) ?? []), { createdAt: x.resumeVersion!.createdAt, appliedAt: x.appliedAt }]);

  return {
    key: "staff",
    columns: STAFF_COLUMNS,
    rows: emps.map((e) => {
      const n = Number(a.get(e.id)?.n ?? 0);
      const worked = p.get(e.id) ?? 0;
      const avg = avgMinutes(g.get(e.id) ?? []);
      return {
        id: e.id,
        employee: e.user.name,
        code: e.employeeCode,
        applications: n,
        daysWorked: worked,
        perDay: worked ? Math.round((n / worked) * 10) / 10 : null,
        responseRate: pct(Number(a.get(e.id)?.responded ?? 0), n),
        interviews: iv.get(e.id) ?? 0,
        avgGenToLog: avg === null ? null : Math.round(avg * 10) / 10,
        activeHours: Math.round(((d.get(e.id)?._sum.activeMinutes ?? 0) / 60) * 10) / 10,
        clockedHours: Math.round(((d.get(e.id)?._sum.clockedMinutes ?? 0) / 60) * 10) / 10,
        statusUpdates: d.get(e.id)?._sum.statusUpdates ?? 0,
        messagesSent: d.get(e.id)?._sum.messagesSent ?? 0,
      };
    }),
  };
}

/** Response / interview / offer rates by market and role family (applications applied in range). */
export async function ratesReport(r: Range): Promise<ReportTable> {
  const rows = await db.$queryRaw<{ market: string; titles: string[]; n: bigint; responded: bigint; interviewed: bigint; offered: bigint }[]>`
    SELECT mk.code AS market, sp."targetTitles" AS titles, COUNT(*)::bigint AS n,
      COUNT(*) FILTER (WHERE a.status::text = ANY(${RESPONDED}) OR EXISTS (SELECT 1 FROM "ApplicationEvent" e WHERE e."applicationId" = a.id AND e."toStatus"::text = ANY(${RESPONDED})))::bigint AS responded,
      COUNT(*) FILTER (WHERE a.status::text = ANY(${INTERVIEWED}) OR EXISTS (SELECT 1 FROM "Interview" i WHERE i."applicationId" = a.id) OR EXISTS (SELECT 1 FROM "ApplicationEvent" e WHERE e."applicationId" = a.id AND e."toStatus"::text = ANY(${INTERVIEWED})))::bigint AS interviewed,
      COUNT(*) FILTER (WHERE a.status::text = ANY(${OFFERED}) OR EXISTS (SELECT 1 FROM "ApplicationEvent" e WHERE e."applicationId" = a.id AND e."toStatus"::text = ANY(${OFFERED})))::bigint AS offered
    FROM "JobApplication" a
    JOIN "StudentProfile" sp ON sp.id = a."studentId"
    JOIN "Market" mk ON mk.id = sp."marketId"
    WHERE a."appliedAt" >= ${r.start} AND a."appliedAt" < ${r.end}
      AND (${r.market ?? null}::text IS NULL OR mk.code = ${r.market ?? null})
    GROUP BY 1, 2`;
  // Students' title lists collapse into role families here (cheap: one row per distinct list).
  const acc = new Map<string, { market: string; family: string; n: number; responded: number; interviewed: number; offered: number }>();
  for (const x of rows) {
    const family = roleFamily(x.titles);
    const k = `${x.market}|${family}`;
    const a = acc.get(k) ?? { market: x.market, family, n: 0, responded: 0, interviewed: 0, offered: 0 };
    a.n += Number(x.n);
    a.responded += Number(x.responded);
    a.interviewed += Number(x.interviewed);
    a.offered += Number(x.offered);
    acc.set(k, a);
  }
  return {
    key: "rates",
    columns: [
      { key: "market", type: "text" },
      { key: "roleFamily", type: "text" },
      { key: "applications", type: "int" },
      { key: "responseRate", type: "pct" },
      { key: "interviewRate", type: "pct" },
      { key: "offerRate", type: "pct" },
    ],
    rows: [...acc.values()]
      .sort((a, b) => a.market.localeCompare(b.market) || b.n - a.n)
      .map((a) => ({ market: a.market, roleFamily: a.family, applications: a.n, responseRate: pct(a.responded, a.n), interviewRate: pct(a.interviewed, a.n), offerRate: pct(a.offered, a.n) })),
  };
}

/** Retention cohorts by first-payment month (range filters the cohort months). */
export async function retentionReport(r: Range, now = new Date()): Promise<ReportTable> {
  const rows = await db.$queryRaw<{ studentId: string; first: Date; through: Date | null }[]>`
    SELECT f."studentId", f.first, (SELECT MAX(s."currentPeriodEnd") FROM "Subscription" s WHERE s."studentId" = f."studentId" AND s.status <> 'PENDING_PAYMENT') AS through
    FROM (
      SELECT p."studentId", MIN(p."paidAt") AS first FROM "Payment" p
      WHERE p.status IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED') AND p."paidAt" IS NOT NULL GROUP BY 1
    ) f
    JOIN "StudentProfile" sp ON sp.id = f."studentId" JOIN "Market" mk ON mk.id = sp."marketId"
    WHERE f.first >= ${r.start} AND f.first < ${r.end}
      AND (${r.market ?? null}::text IS NULL OR mk.code = ${r.market ?? null})`;
  const cohorts = cohortRetention(rows.map((x) => ({ firstPaidAt: x.first, paidThrough: x.through })), now);
  return {
    key: "retention",
    columns: [
      { key: "cohort", type: "text" },
      { key: "size", type: "int" },
      { key: "m1", type: "pct" },
      { key: "m2", type: "pct" },
      { key: "m3", type: "pct" },
    ],
    rows: cohorts.map((c) => ({ cohort: c.cohort, size: c.size, m1: c.retention[0] ?? null, m2: c.retention[1] ?? null, m3: c.retention[2] ?? null })),
  };
}

export async function runReport(key: ReportKey, r: Range): Promise<ReportTable> {
  switch (key) {
    case "revenue":
      return revenueReport(r);
    case "delivery-students":
      return deliveryByStudent(r);
    case "delivery-employees":
      return deliveryByEmployee(r);
    case "staff":
      return staffPerformance(r);
    case "rates":
      return ratesReport(r);
    case "retention":
      return retentionReport(r);
  }
}
