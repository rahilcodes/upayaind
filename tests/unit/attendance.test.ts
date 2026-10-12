import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import {
  attendanceStatus,
  autoCloseSessions,
  boardState,
  clockIn,
  clockOut,
  computeDayFigures,
  correctDay,
  correctSession,
  employeeContext,
  endBreak,
  getMyToday,
  holidayRegions,
  recordHeartbeat,
  rollupDay,
  runAttendanceRollup,
  startBreak,
} from "@/server/services/attendance";
import { dateOnly } from "@/lib/dates";
import { makeEmployee, makeMarket, resetDb } from "../setup/db";

vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => undefined) }));

// Monday 12 Oct 2026 in IST (UTC+5:30). 09:30 IST = 04:00 UTC.
const IST = (hhmm: string, day = "2026-10-12") => new Date(`${day}T${hhmm}:00+05:30`);

beforeEach(async () => {
  await resetDb();
});

async function employee() {
  const m = await makeMarket();
  const e = await makeEmployee(m.id, { name: "Arjun Rao" });
  return { ...e, actor: { id: e.user.id, role: "EMPLOYEE" as const } };
}

describe("pure maths", () => {
  it("subtracts breaks from clocked time and clips to the day", () => {
    const start = IST("00:00");
    const end = IST("00:00", "2026-10-13");
    const f = computeDayFigures(
      [{ startedAt: IST("09:30"), endedAt: IST("18:30"), breaks: [{ startedAt: IST("13:00"), endedAt: IST("13:45") }] }],
      start,
      end,
      IST("23:00"),
    );
    expect(f).toMatchObject({ clockedMinutes: 9 * 60 - 45, breakMinutes: 45, open: false, onBreak: false });
    expect(f.clockInAt?.toISOString()).toBe(IST("09:30").toISOString());
    expect(f.clockOutAt?.toISOString()).toBe(IST("18:30").toISOString());
  });

  it("counts open sessions and breaks until now", () => {
    const f = computeDayFigures([{ startedAt: IST("09:00"), endedAt: null, breaks: [{ startedAt: IST("11:00"), endedAt: null }] }], IST("00:00"), IST("00:00", "2026-10-13"), IST("11:30"));
    expect(f).toMatchObject({ clockedMinutes: 120, breakMinutes: 30, open: true, onBreak: true, clockOutAt: null });
  });

  it("maps clocked minutes and calendar facts to a status", () => {
    expect(attendanceStatus({ clockedMinutes: 240, leave: null, holiday: false, workingDay: true })).toBe("PRESENT");
    expect(attendanceStatus({ clockedMinutes: 239, leave: null, holiday: false, workingDay: true })).toBe("HALF_DAY");
    expect(attendanceStatus({ clockedMinutes: 120, leave: null, holiday: false, workingDay: true })).toBe("HALF_DAY");
    expect(attendanceStatus({ clockedMinutes: 119, leave: null, holiday: false, workingDay: true })).toBe("ABSENT");
    expect(attendanceStatus({ clockedMinutes: 0, leave: "FULL", holiday: false, workingDay: true })).toBe("ON_LEAVE");
    expect(attendanceStatus({ clockedMinutes: 0, leave: null, holiday: true, workingDay: true })).toBe("HOLIDAY");
    expect(attendanceStatus({ clockedMinutes: 0, leave: null, holiday: false, workingDay: false })).toBe("WEEKEND");
  });

  it("holiday region is IN for India-based staff, else the served markets", () => {
    expect(holidayRegions("Asia/Kolkata", ["US"])).toEqual(["IN"]);
    expect(holidayRegions("America/Chicago", ["US", "CA"])).toEqual(["US", "CA"]);
  });

  it("board state: active / idle / break / not in / leave", () => {
    const now = IST("12:00");
    const base = { open: true, onBreak: false, now, leave: false, workingDay: true, clockedToday: true };
    expect(boardState({ ...base, lastActivityAt: IST("11:58") })).toBe("active");
    expect(boardState({ ...base, lastActivityAt: IST("11:40") })).toBe("idle");
    expect(boardState({ ...base, onBreak: true, lastActivityAt: IST("11:40") })).toBe("break");
    expect(boardState({ ...base, open: false, clockedToday: false, lastActivityAt: null })).toBe("notIn");
    expect(boardState({ ...base, open: false, clockedToday: false, leave: true, lastActivityAt: null })).toBe("leave");
  });
});

describe("simulated day (M7 acceptance)", () => {
  it("produces correct clocked/active minutes and status", async () => {
    const e = await employee();
    await db.loginEvent.create({ data: { userId: e.user.id, email: e.user.email, success: true, at: IST("09:25") } });
    await clockIn(e.actor, IST("09:30"));
    await expect(clockIn(e.actor, IST("09:31"))).rejects.toThrow(/already clocked in/);
    // Active 09:30–11:29 (120 heartbeats), duplicates within a minute are ignored.
    for (let m = 0; m < 120; m++) await recordHeartbeat(e.user.id, new Date(IST("09:30").getTime() + m * 60_000 + 5_000));
    await recordHeartbeat(e.user.id, new Date(IST("09:30").getTime() + 30_000));
    await startBreak(e.actor, IST("13:00"));
    await expect(startBreak(e.actor, IST("13:01"))).rejects.toThrow(/already on a break/);
    await endBreak(e.actor, IST("13:30"));
    // Live mid-day figures.
    const mid = await getMyToday(e.actor, IST("14:00"));
    expect(mid.day).toMatchObject({ clockedMinutes: 270 - 30, breakMinutes: 30, activeMinutes: 120, open: true, onBreak: false });
    await clockOut(e.actor, IST("18:30"));
    const ctx = await employeeContext(e.employee.id);
    const d = await rollupDay(e.employee.id, "2026-10-12", IST("23:59"), ctx);
    expect(d).toMatchObject({ status: "PRESENT", clockedMinutes: 9 * 60 - 30, breakMinutes: 30, activeMinutes: 120 });
    const row = await db.employeeDay.findUniqueOrThrow({ where: { employeeId_date: { employeeId: e.employee.id, date: dateOnly("2026-10-12") } } });
    expect(row.firstLoginAt?.toISOString()).toBe(IST("09:25").toISOString());
    expect(row.clockInAt?.toISOString()).toBe(IST("09:30").toISOString());
    expect(row.clockOutAt?.toISOString()).toBe(IST("18:30").toISOString());
  });

  it("half day, absent, holiday and weekend", async () => {
    const e = await employee();
    const ctx = await employeeContext(e.employee.id);
    await clockIn(e.actor, IST("10:00", "2026-10-13"));
    await clockOut(e.actor, IST("13:00", "2026-10-13"));
    expect((await rollupDay(e.employee.id, "2026-10-13", IST("23:00", "2026-10-13"), ctx)).status).toBe("HALF_DAY");
    expect((await rollupDay(e.employee.id, "2026-10-14", IST("23:00", "2026-10-14"), ctx)).status).toBe("ABSENT");
    await db.holiday.create({ data: { date: dateOnly("2026-10-15"), name: "Festival", region: "IN" } });
    await db.holiday.create({ data: { date: dateOnly("2026-10-16"), name: "US only", region: "US" } });
    expect((await rollupDay(e.employee.id, "2026-10-15", IST("23:00", "2026-10-15"), ctx)).status).toBe("HOLIDAY");
    expect((await rollupDay(e.employee.id, "2026-10-16", IST("23:00", "2026-10-16"), ctx)).status).toBe("ABSENT");
    expect((await rollupDay(e.employee.id, "2026-10-17", IST("23:00", "2026-10-17"), ctx)).status).toBe("WEEKEND");
  });

  it("approved leave marks the day ON_LEAVE", async () => {
    const e = await employee();
    const lt = await db.leaveType.create({ data: { name: "Casual", annualQuota: 12 } });
    await db.leaveRequest.create({ data: { employeeId: e.employee.id, leaveTypeId: lt.id, fromDate: dateOnly("2026-10-13"), toDate: dateOnly("2026-10-14"), days: 2, reason: "x", status: "APPROVED" } });
    expect((await rollupDay(e.employee.id, "2026-10-13", IST("23:00", "2026-10-13"))).status).toBe("ON_LEAVE");
  });
});

describe("auto-close forgotten sessions", () => {
  it("closes at last activity + 5 min, flags autoClosed, closes breaks", async () => {
    const e = await employee();
    await clockIn(e.actor, IST("09:30"));
    await recordHeartbeat(e.user.id, IST("17:10"));
    await startBreak(e.actor, IST("17:12"));
    // Same local day: left alone.
    expect(await autoCloseSessions(IST("23:00"))).toHaveLength(0);
    const closed = await autoCloseSessions(IST("01:05", "2026-10-13"));
    expect(closed).toHaveLength(1);
    const s = await db.workSession.findFirstOrThrow({ where: { employeeId: e.employee.id }, include: { breaks: true } });
    expect(s.autoClosed).toBe(true);
    expect(s.endedAt?.toISOString()).toBe(new Date(IST("17:16").getTime()).toISOString()); // 17:10 bucket + 1 min + 5 min
    expect(s.breaks[0]!.endedAt?.toISOString()).toBe(s.endedAt?.toISOString());
    // The job rolls the day up too.
    await clockIn(e.actor, IST("09:30", "2026-10-13"));
    const r = await runAttendanceRollup(IST("01:10", "2026-10-14"));
    expect(r.closed).toBe(1);
    const day = await db.employeeDay.findUniqueOrThrow({ where: { employeeId_date: { employeeId: e.employee.id, date: dateOnly("2026-10-13") } } });
    expect(day.clockedMinutes).toBe(0 + 5); // no activity → closed at clock-in + 5 min
  });
});

describe("manual corrections", () => {
  it("requires a reason, writes the audit log and re-rolls the day", async () => {
    const e = await employee();
    const mgr = await db.user.create({ data: { email: "m@t.test", name: "Meena", role: "MANAGER" } });
    const actor = { id: mgr.id, role: "MANAGER" as const };
    const s = await db.workSession.create({ data: { employeeId: e.employee.id, startedAt: IST("09:30"), endedAt: IST("10:30") } });
    await expect(correctSession(actor, { sessionId: s.id, startedAt: IST("09:30"), endedAt: IST("18:30"), reason: " " }, IST("09:00", "2026-10-13"))).rejects.toThrow(/reason/);
    await expect(correctSession(e.actor, { sessionId: s.id, startedAt: IST("09:30"), endedAt: IST("18:30"), reason: "Forgot" }, IST("09:00", "2026-10-13"))).rejects.toThrow(/managers/);
    await correctSession(actor, { sessionId: s.id, startedAt: IST("09:30"), endedAt: IST("18:30"), reason: "Forgot to clock out" }, IST("09:00", "2026-10-13"));
    const day = await db.employeeDay.findUniqueOrThrow({ where: { employeeId_date: { employeeId: e.employee.id, date: dateOnly("2026-10-12") } } });
    expect(day).toMatchObject({ status: "PRESENT", clockedMinutes: 540 });
    expect(await db.auditLog.count({ where: { action: "attendance.session_corrected", entityId: s.id } })).toBe(1);
    await correctDay(actor, { employeeId: e.employee.id, date: "2026-10-12", status: "ON_LEAVE", reason: "Was on leave" }, IST("09:00", "2026-10-13"));
    // Override survives a re-rollup.
    expect((await rollupDay(e.employee.id, "2026-10-12", IST("09:00", "2026-10-13"))).status).toBe("ON_LEAVE");
  });
});
