import "server-only";
import { z } from "zod";
import type { LeaveStatus, Role } from "@/generated/prisma/enums";
import { db, Prisma } from "@/server/db";
import { dateOnly, dayKey, eachDayKey, keyFromDateOnly, weekdayOfKey } from "@/lib/dates";
import { audit } from "./audit";
import { LIMITS, storeUpload, deleteObject } from "./files";
import { notify, notifyManagers } from "./notify";
import { employeeContext, rollupDay } from "./attendance";
import { CoverEntry, applyCoverTx, formatDateRange, listCoverCandidates, loadCoverWindow, notifyCoverPlan, suggestCovers } from "./assignment";
import { log } from "@/server/log";
import { isManagerial } from "@/server/auth/rbac";

/**
 * Leave management (SPEC F9).
 *
 * Balances are per calendar year (D-072): quota = LeaveType.annualQuota;
 * used = APPROVED days whose start falls in the year; pending is shown
 * separately and also reserved when applying. Carry-forward types add last
 * year's unused quota, capped at one year's quota. Types with quota 0
 * (Unpaid, Comp-off) aren't balance-limited.
 *
 * Days = working days in [from, to] per the employee's WorkSchedule minus
 * holidays of their region; a single-day half-day request counts 0.5.
 */

export class LeaveError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "LeaveError";
  }
}

type Actor = { id: string; role: Role };

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

export const ApplyLeaveInput = z
  .object({
    leaveTypeId: z.string().min(1, "Choose a leave type."),
    from: dayKeySchema,
    to: dayKeySchema,
    halfDay: z.enum(["FIRST", "SECOND"]).nullable().optional(),
    reason: z.string().trim().min(3, "Tell your manager why (a few words is fine).").max(1000),
  })
  .refine((v) => v.to >= v.from, { message: "The end date can't be before the start date.", path: ["to"] })
  .refine((v) => !v.halfDay || v.from === v.to, { message: "A half day must start and end on the same date.", path: ["halfDay"] });
export type ApplyLeaveInputT = z.input<typeof ApplyLeaveInput>;

async function myEmployee(user: Actor) {
  const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ep) throw new LeaveError("Your account doesn't have an employee profile.");
  return ep.id;
}

/** Working days in [from, to] for this employee (schedule days minus regional holidays). */
export async function countLeaveDays(employeeId: string, from: string, to: string, halfDay?: "FIRST" | "SECOND" | null) {
  const ctx = await employeeContext(employeeId);
  const holidays = ctx.regions.length
    ? await db.holiday.findMany({ where: { region: { in: ctx.regions }, date: { gte: dateOnly(from), lte: dateOnly(to) } }, select: { date: true } })
    : [];
  const hk = new Set(holidays.map((h) => keyFromDateOnly(h.date)));
  const days = eachDayKey(from, to).filter((k) => ctx.schedule.days.includes(weekdayOfKey(k)) && !hk.has(k)).length;
  if (halfDay) return days > 0 ? 0.5 : 0;
  return days;
}

/** Pure balance maths (unit-tested). */
export function computeBalance(input: { annualQuota: number; carryForward: boolean; usedThisYear: number; usedLastYear: number; pending: number }) {
  const carried = input.carryForward && input.annualQuota > 0 ? Math.max(0, Math.min(input.annualQuota, input.annualQuota - input.usedLastYear)) : 0;
  const entitled = input.annualQuota + carried;
  const remaining = entitled - input.usedThisYear;
  return { quota: input.annualQuota, carried, entitled, used: input.usedThisYear, pending: input.pending, remaining, available: remaining - input.pending, limited: input.annualQuota > 0 };
}

const yearRange = (y: number) => ({ gte: dateOnly(`${y}-01-01`), lte: dateOnly(`${y}-12-31`) });

export async function getBalances(employeeId: string, year: number, opts: { excludeRequestId?: string } = {}) {
  const types = await db.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, annualQuota: true, paid: true, carryForward: true } });
  const reqs = await db.leaveRequest.findMany({
    where: { employeeId, status: { in: ["APPROVED", "PENDING"] }, fromDate: { gte: dateOnly(`${year - 1}-01-01`), lte: dateOnly(`${year}-12-31`) }, ...(opts.excludeRequestId ? { NOT: { id: opts.excludeRequestId } } : {}) },
    select: { leaveTypeId: true, status: true, days: true, fromDate: true },
  });
  return types.map((t) => {
    const mine = reqs.filter((r) => r.leaveTypeId === t.id);
    const inYear = (r: (typeof mine)[number], y: number) => r.fromDate.getUTCFullYear() === y;
    const sum = (xs: typeof mine) => xs.reduce((a, r) => a + r.days, 0);
    return {
      type: t,
      ...computeBalance({
        annualQuota: t.annualQuota,
        carryForward: t.carryForward,
        usedThisYear: sum(mine.filter((r) => r.status === "APPROVED" && inYear(r, year))),
        usedLastYear: sum(mine.filter((r) => r.status === "APPROVED" && inYear(r, year - 1))),
        pending: sum(mine.filter((r) => r.status === "PENDING" && inYear(r, year))),
      }),
    };
  });
}

/** Overlap rule: any PENDING/APPROVED request on the same dates blocks, except two different halves of one day. */
export async function findOverlap(employeeId: string, from: string, to: string, halfDay: "FIRST" | "SECOND" | null | undefined, excludeId?: string) {
  const rows = await db.leaveRequest.findMany({
    where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: dateOnly(to) }, toDate: { gte: dateOnly(from) }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true, fromDate: true, toDate: true, halfDay: true, status: true },
  });
  return rows.find((r) => !(halfDay && r.halfDay && r.halfDay !== halfDay && keyFromDateOnly(r.fromDate) === from && keyFromDateOnly(r.toDate) === to)) ?? null;
}

export async function applyLeave(user: Actor, raw: ApplyLeaveInputT, attachment: { buffer: Buffer; filename?: string } | null = null, now = new Date()) {
  const input = ApplyLeaveInput.parse(raw);
  const employeeId = await myEmployee(user);
  const ctx = await employeeContext(employeeId);
  if (input.from < dayKey(new Date(now.getTime() - 30 * 86400e3), ctx.timezone)) throw new LeaveError("Leave can't start more than 30 days in the past.", "from");
  if (input.to > `${Number(input.from.slice(0, 4)) + 1}-12-31`) throw new LeaveError("That's too far ahead.", "to");
  const type = await db.leaveType.findUnique({ where: { id: input.leaveTypeId }, select: { id: true, name: true, isActive: true, annualQuota: true } });
  if (!type?.isActive) throw new LeaveError("Choose a leave type.", "leaveTypeId");
  const days = await countLeaveDays(employeeId, input.from, input.to, input.halfDay);
  if (days <= 0) throw new LeaveError("Those dates are all weekends or holidays, so there's nothing to request.", "from");
  if (await findOverlap(employeeId, input.from, input.to, input.halfDay)) throw new LeaveError("You already have a leave request covering some of these dates.", "from");
  const year = Number(input.from.slice(0, 4));
  if (input.to.slice(0, 4) !== input.from.slice(0, 4)) throw new LeaveError("Split leave that crosses the new year into two requests.", "to");
  const bal = (await getBalances(employeeId, year)).find((b) => b.type.id === type.id);
  if (bal?.limited && days > bal.available) {
    throw new LeaveError(`Not enough ${type.name} leave: ${bal.available} day(s) available, ${days} requested.`, "leaveTypeId");
  }
  let attachmentKey: string | null = null;
  if (attachment) {
    const f = await storeUpload({ buffer: attachment.buffer, filename: attachment.filename, ownerUserId: user.id, purpose: "leave", allowed: ["pdf", "png", "jpg", "docx"], maxBytes: LIMITS.leave, keyPrefix: `leave/${employeeId}` });
    attachmentKey = f.key;
  }
  try {
    const req = await db.leaveRequest.create({
      data: { employeeId, leaveTypeId: type.id, fromDate: dateOnly(input.from), toDate: dateOnly(input.to), halfDay: input.halfDay ?? null, days, reason: input.reason, attachmentKey },
      select: { id: true, days: true },
    });
    await audit({ actorId: user.id, action: "leave.request", entity: "LeaveRequest", entityId: req.id, after: { type: type.name, from: input.from, to: input.to, days } });
    await notifyManagers("leave_request", { employeeName: ctx.name, type: type.name, from: input.from, to: input.to, days, reason: input.reason }).catch((e) => log.error("leave.notify_failed", { err: e }));
    return req;
  } catch (e) {
    if (attachmentKey) await deleteObject(attachmentKey).catch(() => undefined);
    throw e;
  }
}

export async function cancelLeave(user: Actor, id: string) {
  const employeeId = await myEmployee(user);
  const r = await db.leaveRequest.updateMany({ where: { id, employeeId, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (!r.count) throw new LeaveError("Only pending requests can be cancelled.");
  await audit({ actorId: user.id, action: "leave.cancel", entity: "LeaveRequest", entityId: id });
  return { id };
}

export async function myLeave(user: Actor, now = new Date()) {
  const employeeId = await myEmployee(user);
  const ctx = await employeeContext(employeeId);
  const year = Number(dayKey(now, ctx.timezone).slice(0, 4));
  const [balances, history, types] = await Promise.all([
    getBalances(employeeId, year),
    db.leaveRequest.findMany({
      where: { employeeId },
      orderBy: { fromDate: "desc" },
      take: 50,
      select: { id: true, fromDate: true, toDate: true, halfDay: true, days: true, reason: true, status: true, decisionNote: true, decidedAt: true, createdAt: true, attachmentKey: true, leaveType: { select: { name: true } } },
    }),
    db.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, paid: true, annualQuota: true } }),
  ]);
  const [files, covers] = await Promise.all([attachmentIds(history.map((h) => h.attachmentKey)), coverSummaries(history.filter((h) => h.status === "APPROVED").map((h) => h.id))]);
  return {
    year,
    balances,
    types,
    history: history.map((h) => ({ ...h, attachmentId: h.attachmentKey ? (files.get(h.attachmentKey) ?? null) : null, covers: covers.get(h.id) ?? [] })),
    timezone: ctx.timezone,
    regions: ctx.regions,
  };
}

async function attachmentIds(keys: (string | null)[]) {
  const ks = keys.filter((k): k is string => Boolean(k));
  if (!ks.length) return new Map<string, string>();
  const files = await db.fileObject.findMany({ where: { key: { in: ks } }, select: { id: true, key: true } });
  return new Map(files.map((f) => [f.key, f.id]));
}

// ───────────────────────────── Manager / admin ─────────────────────────────

function requireManager(actor: Actor) {
  if (!isManagerial(actor.role)) throw new LeaveError("Only managers and admins can do this.");
}

export async function listPending() {
  const rows = await db.leaveRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { fromDate: "asc" },
    select: {
      id: true,
      fromDate: true,
      toDate: true,
      halfDay: true,
      days: true,
      reason: true,
      createdAt: true,
      attachmentKey: true,
      employeeId: true,
      leaveType: { select: { id: true, name: true } },
      employee: { select: { employeeCode: true, user: { select: { name: true } }, _count: { select: { assignments: { where: { isActive: true, type: "PRIMARY" } } } } } },
    },
  });
  const files = await attachmentIds(rows.map((r) => r.attachmentKey));
  const out = [];
  for (const r of rows) {
    const bal = (await getBalances(r.employeeId, r.fromDate.getUTCFullYear(), { excludeRequestId: r.id })).find((b) => b.type.id === r.leaveType.id);
    out.push({ ...r, attachmentId: r.attachmentKey ? (files.get(r.attachmentKey) ?? null) : null, balance: bal ?? null, students: r.employee._count.assignments });
  }
  return out;
}

export async function listRecentDecisions(take = 20) {
  const rows = await db.leaveRequest.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] } },
    orderBy: { decidedAt: "desc" },
    take,
    select: { id: true, fromDate: true, toDate: true, days: true, status: true, decisionNote: true, decidedAt: true, coverEmployeeId: true, employeeId: true, leaveType: { select: { name: true } }, employee: { select: { user: { select: { name: true } }, _count: { select: { assignments: { where: { isActive: true, type: "PRIMARY" } } } } } } },
  });
  const covers = await coverSummaries(rows.filter((r) => r.status === "APPROVED").map((r) => r.id));
  return rows.map((r) => ({ ...r, students: r.employee._count.assignments, covers: covers.get(r.id) ?? [] }));
}

export const DecideInput = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(1000).optional().nullable(),
  /** Approve + cover in one step (D-144): per-applicant cover for the leave window. Ignored on rejection. */
  covers: z.array(CoverEntry).max(500).optional(),
});

export async function decideLeave(actor: Actor, raw: z.input<typeof DecideInput>, now = new Date()) {
  requireManager(actor);
  const input = DecideInput.parse(raw);
  if (input.decision === "REJECTED" && !input.note) throw new LeaveError("Add a comment explaining the rejection.", "note");
  const req = await db.leaveRequest.findUnique({
    where: { id: input.id },
    select: { id: true, status: true, employeeId: true, fromDate: true, toDate: true, days: true, halfDay: true, leaveType: { select: { id: true, name: true, annualQuota: true } }, employee: { select: { userId: true } } },
  });
  if (!req) throw new LeaveError("Leave request not found.");
  if (req.employee.userId === actor.id) throw new LeaveError("You can't decide your own leave request.");
  if (req.status !== "PENDING") throw new LeaveError("This request has already been decided.");
  // Decision + cover plan in one transaction: a failing cover never leaves an approved-but-uncovered leave.
  const cover = await db.$transaction(
    async (tx) => {
      const updated = await tx.leaveRequest.updateMany({
        where: { id: req.id, status: "PENDING" },
        data: { status: input.decision, decidedById: actor.id, decidedAt: now, decisionNote: input.note || null },
      });
      if (!updated.count) throw new LeaveError("This request has already been decided.");
      await audit({ actorId: actor.id, action: input.decision === "APPROVED" ? "leave.approve" : "leave.reject", entity: "LeaveRequest", entityId: req.id, before: { status: req.status }, after: { status: input.decision, note: input.note, covers: input.covers?.length } }, tx);
      if (input.decision === "APPROVED" && input.covers) return applyCoverTx(tx, actor.id, { leaveRequestId: req.id, covers: input.covers }, now);
      return null;
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
  const from = keyFromDateOnly(req.fromDate);
  const to = keyFromDateOnly(req.toDate);
  // Approved leave marks past days ON_LEAVE right away (future days are rolled up nightly).
  if (input.decision === "APPROVED") {
    const ctx = await employeeContext(req.employeeId);
    const today = dayKey(now, ctx.timezone);
    for (const k of eachDayKey(from, to)) if (k < today) await rollupDay(req.employeeId, k, now, ctx);
  }
  await notify(req.employee.userId, "leave_decision", { decision: input.decision === "APPROVED" ? "approved" : "rejected", type: req.leaveType.name, from, to, note: input.note ?? "" }).catch((e) => log.error("leave.notify_failed", { err: e }));
  if (cover) await notifyCoverPlan(cover).catch((e) => log.error("cover.notify_failed", { err: e }));
  return { id: req.id, status: input.decision as LeaveStatus, employeeId: req.employeeId, from, to, cover: cover ? { created: cover.created, ended: cover.ended } : null };
}

/** Employees who could cover (active, not a coach, not the one on leave, not on leave themselves in the window). */
export async function coverCandidates(leaveRequestId: string) {
  const { window } = await loadCoverWindow(db, leaveRequestId);
  return listCoverCandidates(db, window);
}

/**
 * Everything the "approve and set cover" dialog needs (D-144): the leave
 * window, the employee's active applicants with a suggested cover each, and the
 * candidates. Suggestions keep an existing cover for this leave and otherwise
 * spread the applicants over same-market colleagues by load.
 */
export async function planCover(leaveRequestId: string) {
  const { status, window } = await loadCoverWindow(db, leaveRequestId);
  const [rows, candidates, existing] = await Promise.all([
    db.assignment.findMany({
      where: { employeeId: window.primaryEmployeeId, isActive: true, type: "PRIMARY" },
      select: { studentId: true, student: { select: { marketId: true, targetTitles: true, market: { select: { code: true } }, user: { select: { name: true } } } } },
    }),
    listCoverCandidates(db, window),
    db.assignment.findMany({ where: { leaveRequestId, type: "COVER", isActive: true }, select: { studentId: true, employeeId: true } }),
  ]);
  const students = rows
    .map((r) => ({ studentId: r.studentId, name: r.student.user.name, marketId: r.student.marketId, marketCode: r.student.market.code, targetTitles: r.student.targetTitles }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const current = Object.fromEntries(existing.map((e) => [e.studentId, e.employeeId]));
  const suggested = suggestCovers(students, candidates, current);
  return {
    status,
    employeeName: window.primaryName,
    window: { from: window.from, to: window.to, fromKey: window.fromKey, toKey: window.toKey, label: formatDateRange(window.fromKey, window.toKey) },
    students: students.map((s) => ({ ...s, currentCoverId: current[s.studentId] ?? null, suggestedCoverId: suggested[s.studentId] ?? null })),
    candidates,
  };
}

/** Who covers whom for these leaves: leaveRequestId → [{employeeId, name, count}] from the active COVER rows (D-144). */
export async function coverSummaries(leaveRequestIds: string[]) {
  const out = new Map<string, { employeeId: string; name: string; count: number }[]>();
  if (!leaveRequestIds.length) return out;
  const rows = await db.assignment.findMany({
    where: { leaveRequestId: { in: leaveRequestIds }, type: "COVER", isActive: true },
    select: { leaveRequestId: true, employeeId: true, employee: { select: { user: { select: { name: true } } } } },
  });
  for (const r of rows) {
    const list = out.get(r.leaveRequestId!) ?? [];
    const hit = list.find((x) => x.employeeId === r.employeeId);
    if (hit) hit.count += 1;
    else list.push({ employeeId: r.employeeId, name: r.employee.user.name, count: 1 });
    out.set(r.leaveRequestId!, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return out;
}

/** Leave calendar: approved + pending leave overlapping [from, to], plus holidays. */
export async function leaveCalendar(from: string, to: string) {
  const [leaves, holidays] = await Promise.all([
    db.leaveRequest.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] }, fromDate: { lte: dateOnly(to) }, toDate: { gte: dateOnly(from) } },
      orderBy: { fromDate: "asc" },
      select: { id: true, fromDate: true, toDate: true, halfDay: true, status: true, days: true, coverEmployeeId: true, leaveType: { select: { name: true } }, employee: { select: { id: true, employeeCode: true, user: { select: { name: true } } } } },
    }),
    db.holiday.findMany({ where: { date: { gte: dateOnly(from), lte: dateOnly(to) } }, orderBy: { date: "asc" }, select: { id: true, date: true, name: true, region: true } }),
  ]);
  return { leaves, holidays, days: eachDayKey(from, to) };
}

// ───────────────────────────── Leave types & holidays CRUD ─────────────────────────────

export const LeaveTypeInput = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, "Name the leave type.").max(40),
  annualQuota: z.coerce.number().min(0, "Quota can't be negative.").max(365),
  paid: z.boolean(),
  carryForward: z.boolean(),
  isActive: z.boolean(),
});

export async function listLeaveTypes() {
  return db.leaveType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, annualQuota: true, paid: true, carryForward: true, isActive: true, _count: { select: { requests: true } } } });
}

export async function saveLeaveType(actor: Actor, raw: z.input<typeof LeaveTypeInput>) {
  requireManager(actor);
  const v = LeaveTypeInput.parse(raw);
  const data = { name: v.name, annualQuota: v.annualQuota, paid: v.paid, carryForward: v.carryForward, isActive: v.isActive };
  try {
    const before = v.id ? await db.leaveType.findUnique({ where: { id: v.id } }) : null;
    const t = v.id ? await db.leaveType.update({ where: { id: v.id }, data, select: { id: true } }) : await db.leaveType.create({ data, select: { id: true } });
    await audit({ actorId: actor.id, action: v.id ? "leave_type.update" : "leave_type.create", entity: "LeaveType", entityId: t.id, before, after: data });
    return t;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new LeaveError("A leave type with this name already exists.", "name");
    throw e;
  }
}

export const HolidayInput = z.object({
  date: dayKeySchema,
  name: z.string().trim().min(2, "Name the holiday.").max(80),
  region: z.string().trim().toUpperCase().regex(/^[A-Z]{2,8}$/, "Use a region code such as IN or US."),
});

export async function listHolidays(year: number) {
  return db.holiday.findMany({ where: { date: yearRange(year) }, orderBy: [{ date: "asc" }, { region: "asc" }], select: { id: true, date: true, name: true, region: true } });
}

export async function holidayRegionOptions() {
  const [markets, existing] = await Promise.all([db.market.findMany({ select: { code: true } }), db.holiday.findMany({ distinct: ["region"], select: { region: true } })]);
  return [...new Set(["IN", ...markets.map((m) => m.code), ...existing.map((h) => h.region)])].sort();
}

export async function addHoliday(actor: Actor, raw: z.input<typeof HolidayInput>) {
  requireManager(actor);
  const v = HolidayInput.parse(raw);
  try {
    const h = await db.holiday.create({ data: { date: dateOnly(v.date), name: v.name, region: v.region }, select: { id: true } });
    await audit({ actorId: actor.id, action: "holiday.create", entity: "Holiday", entityId: h.id, after: v });
    return h;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new LeaveError("There's already a holiday on this date for this region.", "date");
    throw e;
  }
}

export async function deleteHoliday(actor: Actor, id: string) {
  requireManager(actor);
  const before = await db.holiday.findUnique({ where: { id } });
  if (!before) throw new LeaveError("Holiday not found.");
  await db.holiday.delete({ where: { id } });
  await audit({ actorId: actor.id, action: "holiday.delete", entity: "Holiday", entityId: id, before });
  return { id };
}
