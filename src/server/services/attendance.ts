import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { AttendanceStatus, Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { addDayKey, dateOnly, dayKey, eachDayKey, keyFromDateOnly, startOfDayInTz, weekdayOfKey } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { audit } from "./audit";

/**
 * Attendance & time tracking (SPEC F8).
 *
 * - One open WorkSession per employee (partial unique index `one_open_session`).
 * - Breaks are BreakPeriod rows inside the open session.
 * - Heartbeats (POST /api/heartbeat) upsert one ActivityMinute per minute.
 * - Day figures are computed live for today and rolled up nightly into EmployeeDay.
 * - Forgotten sessions are auto-closed at the last activity ping + 5 min (autoClosed=true).
 *
 * Holiday region (D-070): staff whose timezone is in India (Asia/Kolkata) use
 * region "IN"; everyone else uses the codes of the markets they serve.
 */

export class AttendanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceError";
  }
}

type Actor = { id: string; role: Role };

// ───────────────────────────── Schedule ─────────────────────────────

export type WorkSchedule = { days: number[]; startTime: string; hours: number };
export const DEFAULT_SCHEDULE: WorkSchedule = { days: [1, 2, 3, 4, 5], startTime: "09:30", hours: 9 };

export function parseSchedule(raw: unknown): WorkSchedule {
  const r = (raw ?? {}) as Partial<WorkSchedule>;
  const days = Array.isArray(r.days) ? r.days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : DEFAULT_SCHEDULE.days;
  const startTime = typeof r.startTime === "string" && /^\d{1,2}:\d{2}$/.test(r.startTime) ? r.startTime : DEFAULT_SCHEDULE.startTime;
  const hours = typeof r.hours === "number" && r.hours > 0 && r.hours <= 24 ? r.hours : DEFAULT_SCHEDULE.hours;
  return { days, startTime, hours };
}

const INDIA_TZ = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

/** Holiday regions for an employee (D-070). */
export function holidayRegions(timezone: string, marketCodes: string[]): string[] {
  if (INDIA_TZ.has(timezone)) return ["IN"];
  return marketCodes.length ? marketCodes : [];
}

export type EmployeeCtx = {
  id: string;
  userId: string;
  name: string;
  timezone: string;
  schedule: WorkSchedule;
  regions: string[];
  managerId: string | null;
};

export async function employeeContext(employeeId: string): Promise<EmployeeCtx> {
  const e = await db.employeeProfile.findUnique({
    where: { id: employeeId },
    select: { id: true, userId: true, workSchedule: true, marketIds: true, managerId: true, user: { select: { timezone: true, name: true } } },
  });
  if (!e) throw new AttendanceError("Employee not found.");
  const markets = e.marketIds.length ? await db.market.findMany({ where: { id: { in: e.marketIds } }, select: { code: true } }) : [];
  return {
    id: e.id,
    userId: e.userId,
    name: e.user.name,
    timezone: e.user.timezone,
    schedule: parseSchedule(e.workSchedule),
    regions: holidayRegions(e.user.timezone, markets.map((m) => m.code)),
    managerId: e.managerId,
  };
}

async function myEmployeeId(user: Actor) {
  const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ep) throw new AttendanceError("Your account doesn't have an employee profile, so time tracking isn't available.");
  return ep.id;
}

// ───────────────────────────── Pure day maths ─────────────────────────────

export type SessionLike = { id?: string; startedAt: Date; endedAt: Date | null; breaks: { startedAt: Date; endedAt: Date | null }[] };

function overlapMs(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/**
 * Clocked / break minutes of sessions inside [start, end). Open sessions and
 * breaks run until `now`. Clocked time excludes breaks (SPEC F8).
 */
export function computeDayFigures(sessions: SessionLike[], start: Date, end: Date, now: Date) {
  const s0 = start.getTime();
  const e0 = Math.min(end.getTime(), Math.max(now.getTime(), s0));
  let sessionMs = 0;
  let breakMs = 0;
  let clockInAt: Date | null = null;
  let clockOutAt: Date | null = null;
  let open = false;
  let onBreak = false;
  for (const s of [...sessions].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    const st = s.startedAt.getTime();
    const en = s.endedAt ? s.endedAt.getTime() : now.getTime();
    const ov = overlapMs(st, en, s0, e0);
    if (ov <= 0 && !(st >= s0 && st < end.getTime())) continue;
    sessionMs += ov;
    if (st >= s0 && st < end.getTime() && !clockInAt) clockInAt = s.startedAt;
    if (!clockInAt && ov > 0) clockInAt = new Date(Math.max(st, s0));
    if (!s.endedAt) open = true;
    else if (s.endedAt.getTime() <= end.getTime()) clockOutAt = s.endedAt;
    for (const b of s.breaks) {
      const bs = b.startedAt.getTime();
      const be = b.endedAt ? b.endedAt.getTime() : now.getTime();
      // Clip the break to the session and the day.
      breakMs += overlapMs(Math.max(bs, st), Math.min(be, en), s0, e0);
      if (!s.endedAt && !b.endedAt) onBreak = true;
    }
  }
  if (open) clockOutAt = null;
  const clockedMinutes = Math.max(0, Math.floor((sessionMs - breakMs) / 60000));
  const breakMinutes = Math.floor(breakMs / 60000);
  return { clockInAt, clockOutAt, clockedMinutes, breakMinutes, open, onBreak };
}

/**
 * Attendance status for a day (SPEC F8): PRESENT ≥ 4h clocked, HALF_DAY 2–4h;
 * otherwise ON_LEAVE (approved leave), HOLIDAY, WEEKEND (not a schedule day),
 * else ABSENT. Work beats leave/holiday/weekend when someone actually worked.
 */
export function attendanceStatus(input: { clockedMinutes: number; leave: "FULL" | "HALF" | null; holiday: boolean; workingDay: boolean }): AttendanceStatus {
  if (input.clockedMinutes >= 240) return "PRESENT";
  if (input.clockedMinutes >= 120) return "HALF_DAY";
  if (input.leave) return "ON_LEAVE";
  if (input.holiday) return "HOLIDAY";
  if (!input.workingDay) return "WEEKEND";
  return "ABSENT";
}

// ───────────────────────────── Clock in/out & breaks ─────────────────────────────

const SESSION_SELECT = { id: true, startedAt: true, endedAt: true, autoClosed: true, breaks: { select: { id: true, startedAt: true, endedAt: true }, orderBy: { startedAt: "asc" } } } satisfies Prisma.WorkSessionSelect;

async function openSession(employeeId: string) {
  return db.workSession.findFirst({ where: { employeeId, endedAt: null }, select: SESSION_SELECT });
}

export async function clockIn(user: Actor, now = new Date()) {
  const employeeId = await myEmployeeId(user);
  try {
    const s = await db.workSession.create({ data: { employeeId, startedAt: now }, select: { id: true, startedAt: true } });
    return s;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AttendanceError("You're already clocked in.");
    throw e;
  }
}

export async function clockOut(user: Actor, now = new Date()) {
  const employeeId = await myEmployeeId(user);
  const s = await openSession(employeeId);
  if (!s) throw new AttendanceError("You aren't clocked in.");
  await db.$transaction([
    db.breakPeriod.updateMany({ where: { sessionId: s.id, endedAt: null }, data: { endedAt: now } }),
    db.workSession.update({ where: { id: s.id }, data: { endedAt: now } }),
  ]);
  return { id: s.id, endedAt: now };
}

export async function startBreak(user: Actor, now = new Date()) {
  const employeeId = await myEmployeeId(user);
  const s = await openSession(employeeId);
  if (!s) throw new AttendanceError("Clock in before starting a break.");
  if (s.breaks.some((b) => !b.endedAt)) throw new AttendanceError("You're already on a break.");
  return db.breakPeriod.create({ data: { sessionId: s.id, startedAt: now }, select: { id: true, startedAt: true } });
}

export async function endBreak(user: Actor, now = new Date()) {
  const employeeId = await myEmployeeId(user);
  const s = await openSession(employeeId);
  const b = s?.breaks.find((x) => !x.endedAt);
  if (!s || !b) throw new AttendanceError("You aren't on a break.");
  await db.breakPeriod.update({ where: { id: b.id }, data: { endedAt: now } });
  return { id: b.id, endedAt: now };
}

// ───────────────────────────── Heartbeats ─────────────────────────────

export function minuteBucket(now: Date) {
  return new Date(Math.floor(now.getTime() / 60000) * 60000);
}

/** One ActivityMinute per user per minute (idempotent). */
export async function recordHeartbeat(userId: string, now = new Date()) {
  const minute = minuteBucket(now);
  // createMany + skipDuplicates = INSERT … ON CONFLICT DO NOTHING (safe under concurrent pings).
  await db.activityMinute.createMany({ data: [{ userId, minute }], skipDuplicates: true });
  await db.user.update({ where: { id: userId }, data: { lastActiveAt: now }, select: { id: true } });
  return { minute };
}

// ───────────────────────────── Day summary ─────────────────────────────

async function leaveForDay(employeeId: string, key: string): Promise<"FULL" | "HALF" | null> {
  const d = dateOnly(key);
  const l = await db.leaveRequest.findFirst({ where: { employeeId, status: "APPROVED", fromDate: { lte: d }, toDate: { gte: d } }, select: { halfDay: true, fromDate: true, toDate: true } });
  if (!l) return null;
  return l.halfDay && l.fromDate.getTime() === l.toDate.getTime() ? "HALF" : "FULL";
}

async function isHoliday(regions: string[], key: string) {
  if (!regions.length) return null;
  const h = await db.holiday.findFirst({ where: { date: dateOnly(key), region: { in: regions } }, select: { name: true } });
  return h?.name ?? null;
}

async function sessionsOverlapping(employeeId: string, start: Date, end: Date) {
  return db.workSession.findMany({
    where: { employeeId, startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] },
    select: SESSION_SELECT,
    orderBy: { startedAt: "asc" },
  });
}

export type DaySummary = {
  key: string;
  status: AttendanceStatus;
  firstLoginAt: Date | null;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  clockedMinutes: number;
  breakMinutes: number;
  activeMinutes: number;
  applications: number;
  statusUpdates: number;
  messagesSent: number;
  open: boolean;
  onBreak: boolean;
  holiday: string | null;
  leave: "FULL" | "HALF" | null;
  workingDay: boolean;
  openSession: { id: string; startedAt: Date; breakStartedAt: Date | null } | null;
  lastActivityAt: Date | null;
};

/** Compute one day for an employee (live for today; used by the nightly rollup). */
export async function computeDay(ctx: EmployeeCtx, key: string, now = new Date()): Promise<DaySummary> {
  const start = startOfDayInTz(key, ctx.timezone);
  const end = startOfDayInTz(addDayKey(key, 1), ctx.timezone);
  const until = now < end ? now : end;
  const [sessions, firstLogin, activeMinutes, lastActivity, applications, statusUpdates, messagesSent, leave, holiday] = await Promise.all([
    sessionsOverlapping(ctx.id, start, end),
    db.loginEvent.findFirst({ where: { userId: ctx.userId, success: true, at: { gte: start, lt: end } }, orderBy: { at: "asc" }, select: { at: true } }),
    db.activityMinute.count({ where: { userId: ctx.userId, minute: { gte: start, lt: end } } }),
    db.activityMinute.findFirst({ where: { userId: ctx.userId, minute: { gte: start, lt: end } }, orderBy: { minute: "desc" }, select: { minute: true } }),
    db.jobApplication.count({ where: { employeeId: ctx.id, appliedAt: { gte: start, lt: end } } }),
    db.applicationEvent.count({ where: { byUserId: ctx.userId, at: { gte: start, lt: end }, fromStatus: { not: null } } }),
    db.message.count({ where: { senderId: ctx.userId, createdAt: { gte: start, lt: end } } }),
    leaveForDay(ctx.id, key),
    isHoliday(ctx.regions, key),
  ]);
  const f = computeDayFigures(sessions, start, end, until);
  const workingDay = ctx.schedule.days.includes(weekdayOfKey(key)) && !holiday;
  const open = sessions.find((s) => !s.endedAt) ?? null;
  return {
    key,
    status: attendanceStatus({ clockedMinutes: f.clockedMinutes, leave, holiday: Boolean(holiday), workingDay: ctx.schedule.days.includes(weekdayOfKey(key)) }),
    firstLoginAt: firstLogin?.at ?? null,
    clockInAt: f.clockInAt,
    clockOutAt: f.clockOutAt,
    clockedMinutes: f.clockedMinutes,
    breakMinutes: f.breakMinutes,
    activeMinutes,
    applications,
    statusUpdates,
    messagesSent,
    open: f.open,
    onBreak: f.onBreak,
    holiday,
    leave,
    workingDay,
    openSession: open ? { id: open.id, startedAt: open.startedAt, breakStartedAt: open.breaks.find((b) => !b.endedAt)?.startedAt ?? null } : null,
    lastActivityAt: lastActivity?.minute ?? null,
  };
}

/** Today's live summary for the signed-in employee (clock card). */
export async function getMyToday(user: Actor, now = new Date()) {
  const employeeId = await myEmployeeId(user);
  const ctx = await employeeContext(employeeId);
  const key = dayKey(now, ctx.timezone);
  return { ctx, day: await computeDay(ctx, key, now) };
}

const OVERRIDE_ACTION = "attendance.day_override";
const overrideId = (employeeId: string, key: string) => `${employeeId}:${key}`;

async function dayOverride(employeeId: string, key: string): Promise<AttendanceStatus | null> {
  const row = await db.auditLog.findFirst({ where: { action: OVERRIDE_ACTION, entity: "EmployeeDay", entityId: overrideId(employeeId, key) }, orderBy: { at: "desc" }, select: { after: true } });
  const status = (row?.after as { status?: AttendanceStatus } | null)?.status;
  return status ?? null;
}

/** Upsert EmployeeDay for one day. A manual status override (audit-logged) wins over the computed status. */
export async function rollupDay(employeeId: string, key: string, now = new Date(), ctx?: EmployeeCtx) {
  const c = ctx ?? (await employeeContext(employeeId));
  const d = await computeDay(c, key, now);
  const status = (await dayOverride(employeeId, key)) ?? d.status;
  const data = {
    status,
    firstLoginAt: d.firstLoginAt,
    clockInAt: d.clockInAt,
    clockOutAt: d.clockOutAt,
    clockedMinutes: d.clockedMinutes,
    breakMinutes: d.breakMinutes,
    activeMinutes: d.activeMinutes,
    applications: d.applications,
    statusUpdates: d.statusUpdates,
    messagesSent: d.messagesSent,
  };
  await db.employeeDay.upsert({ where: { employeeId_date: { employeeId, date: dateOnly(key) } }, update: data, create: { employeeId, date: dateOnly(key), ...data } });
  return { ...d, status };
}

// ───────────────────────────── Auto-close & nightly ─────────────────────────────

/**
 * Close sessions left open from a previous local day at the last activity
 * ping + 5 min (or the clock-in time when there was no activity), flag
 * autoClosed, and close any open break at the same instant.
 */
export async function autoCloseSessions(now = new Date()) {
  const open = await db.workSession.findMany({
    where: { endedAt: null },
    select: { id: true, startedAt: true, employeeId: true, employee: { select: { userId: true, user: { select: { timezone: true } } } } },
  });
  const closed: { id: string; employeeId: string; endedAt: Date }[] = [];
  for (const s of open) {
    const tz = s.employee.user.timezone;
    const today = dayKey(now, tz);
    const startedKey = dayKey(s.startedAt, tz);
    if (startedKey >= today) continue; // still the same local day
    const dayEnd = startOfDayInTz(addDayKey(startedKey, 1), tz);
    const last = await db.activityMinute.findFirst({
      where: { userId: s.employee.userId, minute: { gte: s.startedAt, lt: dayEnd } },
      orderBy: { minute: "desc" },
      select: { minute: true },
    });
    const base = last ? last.minute.getTime() + 60_000 : s.startedAt.getTime();
    const endedAt = new Date(Math.min(Math.max(base + 5 * 60_000, s.startedAt.getTime()), dayEnd.getTime(), now.getTime()));
    const r = await db.workSession.updateMany({ where: { id: s.id, endedAt: null }, data: { endedAt, autoClosed: true } });
    if (r.count) {
      await db.breakPeriod.updateMany({ where: { sessionId: s.id, endedAt: null }, data: { endedAt } });
      await db.breakPeriod.updateMany({ where: { sessionId: s.id, endedAt: { gt: endedAt } }, data: { endedAt } });
      closed.push({ id: s.id, employeeId: s.employeeId, endedAt });
    }
  }
  return closed;
}

async function activeEmployees() {
  return db.employeeProfile.findMany({ where: { user: { status: "ACTIVE", deletedAt: null } }, select: { id: true } });
}

/**
 * Hourly job body: auto-close forgotten sessions, then roll up "yesterday"
 * (local) for every employee during the first hours after their midnight, or
 * whenever yesterday's row is missing (catch-up).
 */
export async function runAttendanceRollup(now = new Date(), opts: { force?: boolean } = {}) {
  const closed = await autoCloseSessions(now);
  let rolled = 0;
  for (const e of await activeEmployees()) {
    const ctx = await employeeContext(e.id);
    const today = dayKey(now, ctx.timezone);
    const yesterday = addDayKey(today, -1);
    const localHour = Number(formatInTz(now, ctx.timezone, "H"));
    const exists = await db.employeeDay.findUnique({ where: { employeeId_date: { employeeId: e.id, date: dateOnly(yesterday) } }, select: { id: true } });
    if (opts.force || localHour < 3 || !exists) {
      await rollupDay(e.id, yesterday, now, ctx);
      rolled++;
    }
  }
  // Re-roll days touched by auto-closed sessions (they may be older than yesterday).
  for (const c of closed) {
    const ctx = await employeeContext(c.employeeId);
    await rollupDay(c.employeeId, dayKey(c.endedAt, ctx.timezone), now, ctx);
  }
  return { closed: closed.length, rolled };
}

// ───────────────────────────── Timesheet (/work/timesheet) ─────────────────────────────

export type TimesheetDay = {
  key: string;
  status: AttendanceStatus | null;
  future: boolean;
  today: boolean;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  clockedMinutes: number;
  breakMinutes: number;
  activeMinutes: number;
  applications: number;
  holiday: string | null;
  leave: boolean;
};

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, "0")}-01`;
  return { first, last: addDayKey(next, -1) };
}

export function isMonthKey(v: string | undefined | null): v is string {
  return Boolean(v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v));
}

/** Calendar month of days (rolled-up rows, live today, planned future), weekly + monthly totals. */
export async function getTimesheet(employeeId: string, month: string, now = new Date()) {
  const ctx = await employeeContext(employeeId);
  const { first, last } = monthBounds(month);
  const today = dayKey(now, ctx.timezone);
  const [rows, holidays, leaves] = await Promise.all([
    db.employeeDay.findMany({ where: { employeeId, date: { gte: dateOnly(first), lte: dateOnly(last) } } }),
    ctx.regions.length ? db.holiday.findMany({ where: { region: { in: ctx.regions }, date: { gte: dateOnly(first), lte: dateOnly(last) } }, select: { date: true, name: true } }) : Promise.resolve([]),
    db.leaveRequest.findMany({ where: { employeeId, status: "APPROVED", fromDate: { lte: dateOnly(last) }, toDate: { gte: dateOnly(first) } }, select: { fromDate: true, toDate: true } }),
  ]);
  const byKey = new Map(rows.map((r) => [keyFromDateOnly(r.date), r]));
  const holidayByKey = new Map(holidays.map((h) => [keyFromDateOnly(h.date), h.name]));
  const live = today >= first && today <= last ? await computeDay(ctx, today, now) : null;
  const days: TimesheetDay[] = eachDayKey(first, last).map((key) => {
    const leave = leaves.some((l) => keyFromDateOnly(l.fromDate) <= key && keyFromDateOnly(l.toDate) >= key);
    const holiday = holidayByKey.get(key) ?? null;
    if (key === today && live) {
      return { key, status: null, future: false, today: true, clockInAt: live.clockInAt, clockOutAt: live.clockOutAt, clockedMinutes: live.clockedMinutes, breakMinutes: live.breakMinutes, activeMinutes: live.activeMinutes, applications: live.applications, holiday, leave };
    }
    if (key > today) {
      const planned: AttendanceStatus | null = leave ? "ON_LEAVE" : holiday ? "HOLIDAY" : !ctx.schedule.days.includes(weekdayOfKey(key)) ? "WEEKEND" : null;
      return { key, status: planned, future: true, today: false, clockInAt: null, clockOutAt: null, clockedMinutes: 0, breakMinutes: 0, activeMinutes: 0, applications: 0, holiday, leave };
    }
    const r = byKey.get(key);
    const fallback: AttendanceStatus = attendanceStatus({ clockedMinutes: 0, leave: leave ? "FULL" : null, holiday: Boolean(holiday), workingDay: ctx.schedule.days.includes(weekdayOfKey(key)) });
    return {
      key,
      status: r?.status ?? fallback,
      future: false,
      today: false,
      clockInAt: r?.clockInAt ?? null,
      clockOutAt: r?.clockOutAt ?? null,
      clockedMinutes: r?.clockedMinutes ?? 0,
      breakMinutes: r?.breakMinutes ?? 0,
      activeMinutes: r?.activeMinutes ?? 0,
      applications: r?.applications ?? 0,
      holiday,
      leave,
    };
  });
  // ISO weeks (Mon–Sun) inside the month.
  const weeks: { from: string; to: string; clockedMinutes: number; activeMinutes: number; daysPresent: number }[] = [];
  for (const d of days) {
    const w = weeks[weeks.length - 1];
    if (!w || weekdayOfKey(d.key) === 1) weeks.push({ from: d.key, to: d.key, clockedMinutes: 0, activeMinutes: 0, daysPresent: 0 });
    const cur = weeks[weeks.length - 1]!;
    cur.to = d.key;
    cur.clockedMinutes += d.clockedMinutes;
    cur.activeMinutes += d.activeMinutes;
    if (d.status === "PRESENT" || d.status === "HALF_DAY" || (d.today && d.clockedMinutes > 0)) cur.daysPresent++;
  }
  const counts: Partial<Record<AttendanceStatus, number>> = {};
  for (const d of days) if (d.status && !d.future) counts[d.status] = (counts[d.status] ?? 0) + 1;
  const total = {
    clockedMinutes: days.reduce((a, d) => a + d.clockedMinutes, 0),
    breakMinutes: days.reduce((a, d) => a + d.breakMinutes, 0),
    activeMinutes: days.reduce((a, d) => a + d.activeMinutes, 0),
    applications: days.reduce((a, d) => a + d.applications, 0),
    counts,
  };
  return { ctx, month, first, last, today, days, weeks, total };
}

export async function listSessions(employeeId: string, from: Date, to: Date) {
  return db.workSession.findMany({
    where: { employeeId, startedAt: { gte: from, lt: to } },
    orderBy: { startedAt: "desc" },
    select: { ...SESSION_SELECT, correctionNote: true, correctedById: true },
  });
}

export async function loginHistory(userId: string, take = 30) {
  return db.loginEvent.findMany({ where: { userId }, orderBy: { at: "desc" }, take, select: { id: true, at: true, ip: true, userAgent: true, success: true, reason: true } });
}

/** The signed-in employee's own timesheet. */
export async function getMyTimesheet(user: Actor, month: string, now = new Date()) {
  const employeeId = await myEmployeeId(user);
  const sheet = await getTimesheet(employeeId, month, now);
  const from = startOfDayInTz(sheet.first, sheet.ctx.timezone);
  const to = startOfDayInTz(addDayKey(sheet.last, 1), sheet.ctx.timezone);
  const [sessions, logins] = await Promise.all([listSessions(employeeId, from, to), loginHistory(user.id)]);
  return { ...sheet, sessions, logins };
}

// ───────────────────────────── Admin board (/admin/attendance) ─────────────────────────────

export type BoardState = "active" | "idle" | "break" | "notIn" | "leave" | "off" | "out";

export function boardState(input: { open: boolean; onBreak: boolean; lastActivityAt: Date | null; now: Date; leave: boolean; workingDay: boolean; clockedToday: boolean }): BoardState {
  if (input.open) {
    if (input.onBreak) return "break";
    const idleMs = input.lastActivityAt ? input.now.getTime() - input.lastActivityAt.getTime() : Infinity;
    if (idleMs <= 5 * 60_000) return "active";
    if (idleMs > 15 * 60_000) return "idle";
    return "active";
  }
  if (input.leave) return "leave";
  if (input.clockedToday) return "out";
  if (!input.workingDay) return "off";
  return "notIn";
}

export async function getAttendanceBoard(now = new Date()) {
  const emps = await db.employeeProfile.findMany({
    where: { user: { status: "ACTIVE", deletedAt: null } },
    select: { id: true, employeeCode: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const rows = [];
  for (const e of emps) {
    const ctx = await employeeContext(e.id);
    const d = await computeDay(ctx, dayKey(now, ctx.timezone), now);
    const state = boardState({ open: d.open, onBreak: d.onBreak, lastActivityAt: d.lastActivityAt, now, leave: Boolean(d.leave), workingDay: d.workingDay, clockedToday: Boolean(d.clockInAt) });
    rows.push({ id: e.id, code: e.employeeCode, name: e.user.name, timezone: ctx.timezone, state, day: d });
  }
  const counts = rows.reduce<Record<BoardState, number>>((acc, r) => ({ ...acc, [r.state]: acc[r.state] + 1 }), { active: 0, idle: 0, break: 0, notIn: 0, leave: 0, off: 0, out: 0 });
  return { rows, counts };
}

// ───────────────────────────── Admin timesheets + export ─────────────────────────────

export async function getTimesheetRange(input: { from: string; to: string; employeeId?: string | null }, now = new Date()) {
  const emps = await db.employeeProfile.findMany({
    where: { ...(input.employeeId ? { id: input.employeeId } : {}), user: { deletedAt: null } },
    select: { id: true, employeeCode: true, user: { select: { name: true, timezone: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const rows = await db.employeeDay.findMany({
    where: { employeeId: { in: emps.map((e) => e.id) }, date: { gte: dateOnly(input.from), lte: dateOnly(input.to) } },
    orderBy: [{ date: "asc" }],
  });
  const out: {
    employeeId: string;
    code: string;
    name: string;
    timezone: string;
    date: string;
    status: AttendanceStatus | null;
    firstLoginAt: Date | null;
    clockInAt: Date | null;
    clockOutAt: Date | null;
    clockedMinutes: number;
    breakMinutes: number;
    activeMinutes: number;
    applications: number;
    statusUpdates: number;
    messagesSent: number;
    live: boolean;
  }[] = [];
  for (const e of emps) {
    const today = dayKey(now, e.user.timezone);
    const mine = rows.filter((r) => r.employeeId === e.id);
    for (const r of mine) {
      if (keyFromDateOnly(r.date) === today) continue;
      out.push({ employeeId: e.id, code: e.employeeCode, name: e.user.name, timezone: e.user.timezone, date: keyFromDateOnly(r.date), status: r.status, firstLoginAt: r.firstLoginAt, clockInAt: r.clockInAt, clockOutAt: r.clockOutAt, clockedMinutes: r.clockedMinutes, breakMinutes: r.breakMinutes, activeMinutes: r.activeMinutes, applications: r.applications, statusUpdates: r.statusUpdates, messagesSent: r.messagesSent, live: false });
    }
    if (today >= input.from && today <= input.to) {
      const ctx = await employeeContext(e.id);
      const d = await computeDay(ctx, today, now);
      out.push({ employeeId: e.id, code: e.employeeCode, name: e.user.name, timezone: e.user.timezone, date: today, status: null, firstLoginAt: d.firstLoginAt, clockInAt: d.clockInAt, clockOutAt: d.clockOutAt, clockedMinutes: d.clockedMinutes, breakMinutes: d.breakMinutes, activeMinutes: d.activeMinutes, applications: d.applications, statusUpdates: d.statusUpdates, messagesSent: d.messagesSent, live: true });
    }
  }
  out.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? 1 : -1));
  const totals = new Map<string, { name: string; code: string; clockedMinutes: number; activeMinutes: number; applications: number; present: number; halfDays: number; absent: number; leave: number }>();
  for (const r of out) {
    const t = totals.get(r.employeeId) ?? { name: r.name, code: r.code, clockedMinutes: 0, activeMinutes: 0, applications: 0, present: 0, halfDays: 0, absent: 0, leave: 0 };
    t.clockedMinutes += r.clockedMinutes;
    t.activeMinutes += r.activeMinutes;
    t.applications += r.applications;
    if (r.status === "PRESENT") t.present++;
    if (r.status === "HALF_DAY") t.halfDays++;
    if (r.status === "ABSENT") t.absent++;
    if (r.status === "ON_LEAVE") t.leave++;
    totals.set(r.employeeId, t);
  }
  return { rows: out, totals: [...totals.entries()].map(([id, t]) => ({ id, ...t })), employees: emps.map((e) => ({ id: e.id, name: e.user.name, code: e.employeeCode })) };
}

const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

export async function exportTimesheets(input: { from: string; to: string; employeeId?: string | null }, format: "csv" | "xlsx", now = new Date()) {
  const { rows } = await getTimesheetRange(input, now);
  const header = ["Date", "Employee", "Code", "Status", "First login", "Clock in", "Clock out", "Clocked (h:mm)", "Break (h:mm)", "Active (h:mm)", "Applications", "Status updates", "Messages sent", "Time zone"];
  const t = (d: Date | null, tz: string) => (d ? formatInTz(d, tz, "HH:mm") : "");
  const data = rows.map((r) => [r.date, r.name, r.code, r.status ?? "IN_PROGRESS", t(r.firstLoginAt, r.timezone), t(r.clockInAt, r.timezone), t(r.clockOutAt, r.timezone), hm(r.clockedMinutes), hm(r.breakMinutes), hm(r.activeMinutes), r.applications, r.statusUpdates, r.messagesSent, r.timezone]);
  if (format === "csv") {
    return { body: Buffer.from(Papa.unparse({ fields: header, data }), "utf8"), mime: "text/csv; charset=utf-8", ext: "csv" };
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "UpayaInd";
  const ws = wb.addWorksheet("Timesheets");
  ws.addRow(header).font = { bold: true };
  for (const r of data) ws.addRow(r);
  ws.columns.forEach((c) => (c.width = 16));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { body: buf, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
}

// ───────────────────────────── Manual corrections (audit-logged) ─────────────────────────────

function requireManager(actor: Actor) {
  if (actor.role !== "MANAGER" && actor.role !== "ADMIN") throw new AttendanceError("Only managers and admins can correct attendance.");
}

function requireReason(reason: string) {
  const r = reason.trim();
  if (r.length < 3) throw new AttendanceError("Add a reason for the correction.");
  return r.slice(0, 500);
}

async function rerollRange(employeeId: string, from: Date, to: Date, now: Date) {
  const ctx = await employeeContext(employeeId);
  const today = dayKey(now, ctx.timezone);
  for (const key of eachDayKey(dayKey(from, ctx.timezone), dayKey(to, ctx.timezone))) {
    if (key < today) await rollupDay(employeeId, key, now, ctx);
  }
}

/** Edit a session's start/end (and optionally clear its breaks outside the new window). */
export async function correctSession(actor: Actor, input: { sessionId: string; startedAt: Date; endedAt: Date | null; reason: string; ip?: string | null }, now = new Date()) {
  requireManager(actor);
  const reason = requireReason(input.reason);
  if (input.endedAt && input.endedAt <= input.startedAt) throw new AttendanceError("The end time must be after the start time.");
  if (input.endedAt && input.endedAt > now) throw new AttendanceError("The end time can't be in the future.");
  const before = await db.workSession.findUnique({ where: { id: input.sessionId }, select: { id: true, employeeId: true, startedAt: true, endedAt: true } });
  if (!before) throw new AttendanceError("Session not found.");
  try {
    await db.workSession.update({ where: { id: input.sessionId }, data: { startedAt: input.startedAt, endedAt: input.endedAt, correctedById: actor.id, correctionNote: reason, autoClosed: false } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AttendanceError("This employee already has an open session.");
    throw e;
  }
  if (input.endedAt) {
    await db.breakPeriod.updateMany({ where: { sessionId: input.sessionId, OR: [{ endedAt: null }, { endedAt: { gt: input.endedAt } }] }, data: { endedAt: input.endedAt } });
  }
  await db.breakPeriod.deleteMany({ where: { sessionId: input.sessionId, OR: [{ startedAt: { lt: input.startedAt } }, ...(input.endedAt ? [{ startedAt: { gte: input.endedAt } }] : [])] } });
  await audit({ actorId: actor.id, action: "attendance.session_corrected", entity: "WorkSession", entityId: input.sessionId, before, after: { startedAt: input.startedAt, endedAt: input.endedAt, reason }, ip: input.ip });
  const from = new Date(Math.min(before.startedAt.getTime(), input.startedAt.getTime()));
  const to = new Date(Math.max(before.endedAt?.getTime() ?? now.getTime(), input.endedAt?.getTime() ?? now.getTime()));
  await rerollRange(before.employeeId, from, to, now);
  return { id: input.sessionId };
}

/** Add a missing session (e.g. the employee forgot to clock in). */
export async function addSession(actor: Actor, input: { employeeId: string; startedAt: Date; endedAt: Date; reason: string; ip?: string | null }, now = new Date()) {
  requireManager(actor);
  const reason = requireReason(input.reason);
  if (input.endedAt <= input.startedAt) throw new AttendanceError("The end time must be after the start time.");
  if (input.endedAt > now) throw new AttendanceError("The end time can't be in the future.");
  const overlap = await db.workSession.count({ where: { employeeId: input.employeeId, startedAt: { lt: input.endedAt }, OR: [{ endedAt: null }, { endedAt: { gt: input.startedAt } }] } });
  if (overlap) throw new AttendanceError("This overlaps an existing session. Edit that session instead.");
  const s = await db.workSession.create({ data: { employeeId: input.employeeId, startedAt: input.startedAt, endedAt: input.endedAt, correctedById: actor.id, correctionNote: reason }, select: { id: true } });
  await audit({ actorId: actor.id, action: "attendance.session_added", entity: "WorkSession", entityId: s.id, after: { employeeId: input.employeeId, startedAt: input.startedAt, endedAt: input.endedAt, reason }, ip: input.ip });
  await rerollRange(input.employeeId, input.startedAt, input.endedAt, now);
  return s;
}

/** Override a past day's attendance status (kept across re-rollups). */
export async function correctDay(actor: Actor, input: { employeeId: string; date: string; status: AttendanceStatus; reason: string; ip?: string | null }, now = new Date()) {
  requireManager(actor);
  const reason = requireReason(input.reason);
  const ctx = await employeeContext(input.employeeId);
  if (input.date >= dayKey(now, ctx.timezone)) throw new AttendanceError("You can only correct past days.");
  const before = await db.employeeDay.findUnique({ where: { employeeId_date: { employeeId: input.employeeId, date: dateOnly(input.date) } }, select: { status: true } });
  await audit({ actorId: actor.id, action: OVERRIDE_ACTION, entity: "EmployeeDay", entityId: overrideId(input.employeeId, input.date), before, after: { status: input.status, reason }, ip: input.ip });
  return rollupDay(input.employeeId, input.date, now, ctx);
}
