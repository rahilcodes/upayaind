import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { applyLeave, cancelLeave, computeBalance, countLeaveDays, decideLeave, getBalances, myLeave } from "@/server/services/leave";
import { autoAssign } from "@/server/services/assignment";
import { dateOnly, dayKey, addDayKey } from "@/lib/dates";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => undefined) }));

beforeEach(async () => {
  await resetDb();
});

async function setup() {
  const m = await makeMarket();
  const e = await makeEmployee(m.id, { name: "Arjun Rao" });
  const mgr = await db.user.create({ data: { email: `mgr${Date.now()}@t.test`, name: "Meena Kapoor", role: "MANAGER" } });
  const casual = await db.leaveType.create({ data: { name: "Casual", annualQuota: 12 } });
  const earned = await db.leaveType.create({ data: { name: "Earned", annualQuota: 15, carryForward: true } });
  const unpaid = await db.leaveType.create({ data: { name: "Unpaid", annualQuota: 0, paid: false } });
  return { m, e, actor: { id: e.user.id, role: "EMPLOYEE" as const }, manager: { id: mgr.id, role: "MANAGER" as const }, casual, earned, unpaid };
}

const NOW = new Date("2026-10-12T06:00:00Z");

describe("balance maths", () => {
  it("adds capped carry-forward and subtracts used + pending", () => {
    expect(computeBalance({ annualQuota: 12, carryForward: false, usedThisYear: 3, usedLastYear: 0, pending: 2 })).toMatchObject({ entitled: 12, remaining: 9, available: 7, carried: 0 });
    expect(computeBalance({ annualQuota: 15, carryForward: true, usedThisYear: 4, usedLastYear: 5, pending: 0 })).toMatchObject({ carried: 10, entitled: 25, remaining: 21 });
    expect(computeBalance({ annualQuota: 15, carryForward: true, usedThisYear: 0, usedLastYear: 20, pending: 0 })).toMatchObject({ carried: 0, entitled: 15 });
    expect(computeBalance({ annualQuota: 0, carryForward: false, usedThisYear: 3, usedLastYear: 0, pending: 0 }).limited).toBe(false);
  });

  it("counts working days only (weekends + regional holidays excluded), half day = 0.5", async () => {
    const c = await setup();
    await db.holiday.create({ data: { date: dateOnly("2026-11-08"), name: "Diwali", region: "IN" } }); // Sunday anyway
    await db.holiday.create({ data: { date: dateOnly("2026-11-09"), name: "Diwali (obs.)", region: "IN" } });
    expect(await countLeaveDays(c.e.employee.id, "2026-11-06", "2026-11-10")).toBe(2); // Fri, (Sat, Sun, Mon hol), Tue
    expect(await countLeaveDays(c.e.employee.id, "2026-11-10", "2026-11-10", "FIRST")).toBe(0.5);
  });
});

describe("apply / overlap / cancel", () => {
  it("applies, blocks overlaps, allows the other half of the same day, cancels pending", async () => {
    const c = await setup();
    const r = await applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-10-19", to: "2026-10-21", reason: "Family function" }, null, NOW);
    expect(r.days).toBe(3);
    await expect(applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-10-21", to: "2026-10-22", reason: "Again" }, null, NOW)).rejects.toThrow(/already have a leave request/);
    await applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-10-26", to: "2026-10-26", halfDay: "FIRST", reason: "Doctor" }, null, NOW);
    await applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-10-26", to: "2026-10-26", halfDay: "SECOND", reason: "Errand" }, null, NOW);
    await expect(applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-10-26", to: "2026-10-26", halfDay: "FIRST", reason: "Dup" }, null, NOW)).rejects.toThrow(/already have/);
    const bal = (await getBalances(c.e.employee.id, 2026)).find((b) => b.type.id === c.casual.id)!;
    expect(bal).toMatchObject({ used: 0, pending: 4, available: 8 });
    await cancelLeave(c.actor, r.id);
    await expect(cancelLeave(c.actor, r.id)).rejects.toThrow(/Only pending/);
    // Managers were notified about the requests.
    expect(await db.notification.count({ where: { userId: c.manager.id, type: "leave_request" } })).toBe(3);
  });

  it("refuses more than the available balance, but unpaid is unlimited", async () => {
    const c = await setup();
    await expect(applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-11-02", to: "2026-11-20", reason: "Long trip" }, null, NOW)).rejects.toThrow(/Not enough Casual/);
    await expect(applyLeave(c.actor, { leaveTypeId: c.unpaid.id, from: "2026-11-02", to: "2026-11-20", reason: "Long trip" }, null, NOW)).resolves.toBeTruthy();
  });

  it("validates dates and weekend-only requests", async () => {
    const c = await setup();
    await expect(applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-10-21", to: "2026-10-19", reason: "Bad" }, null, NOW)).rejects.toThrow(/before the start/);
    await expect(applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-10-17", to: "2026-10-18", reason: "Weekend" }, null, NOW)).rejects.toThrow(/weekends or holidays/);
    await expect(applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-10-19", to: "2026-10-20", halfDay: "FIRST", reason: "x half" }, null, NOW)).rejects.toThrow(/same date/);
  });
});

describe("approval", () => {
  it("approves → ON_LEAVE + notification + excluded from auto-assignment (M7 acceptance)", async () => {
    const c = await setup();
    const other = await makeEmployee(c.m.id, { name: "Divya Menon" });
    const today = dayKey(new Date(), "Asia/Kolkata");
    const req = await applyLeave(c.actor, { leaveTypeId: c.casual.id, from: addDayKey(today, -1), to: addDayKey(today, 1), reason: "Unwell" }, null, new Date());
    await expect(decideLeave(c.actor, { id: req.id, decision: "APPROVED" })).rejects.toThrow(/managers/);
    await expect(decideLeave(c.manager, { id: req.id, decision: "REJECTED" })).rejects.toThrow(/comment/);
    const r = await decideLeave(c.manager, { id: req.id, decision: "APPROVED", note: "Get well soon" });
    expect(r.status).toBe("APPROVED");
    await expect(decideLeave(c.manager, { id: req.id, decision: "APPROVED" })).rejects.toThrow(/already been decided/);
    expect(await db.notification.count({ where: { userId: c.e.user.id, type: "leave_decision" } })).toBe(1);
    // Yesterday (past day of the leave) is rolled up as ON_LEAVE unless it was a weekend.
    const y = await db.employeeDay.findUnique({ where: { employeeId_date: { employeeId: c.e.employee.id, date: dateOnly(addDayKey(today, -1)) } } });
    if (y) expect(["ON_LEAVE", "WEEKEND"]).toContain(y.status === "WEEKEND" ? "WEEKEND" : y.status);
    // Auto-assignment skips the employee on approved leave.
    for (let i = 0; i < 3; i++) {
      const s = await makeStudent(c.m.id);
      expect(await autoAssign(s.student.id, { notifyPeople: false })).toMatchObject({ status: "ASSIGNED", employeeId: other.employee.id });
    }
    const mine = await myLeave(c.actor);
    expect(mine.history[0]).toMatchObject({ status: "APPROVED", decisionNote: "Get well soon" });
  });

  it("a manager can't approve their own request", async () => {
    const c = await setup();
    const mgrEmp = await db.employeeProfile.create({ data: { userId: c.manager.id, employeeCode: "UPY-M1", marketIds: [c.m.id], maxStudents: 0, workSchedule: { days: [1, 2, 3, 4, 5], startTime: "09:30", hours: 9 } } });
    await db.user.update({ where: { id: c.manager.id }, data: { timezone: "Asia/Kolkata" } });
    const req = await applyLeave(c.manager, { leaveTypeId: c.casual.id, from: "2026-10-19", to: "2026-10-19", reason: "Personal" }, null, NOW);
    expect(mgrEmp.id).toBeTruthy();
    await expect(decideLeave(c.manager, { id: req.id, decision: "APPROVED" })).rejects.toThrow(/your own/);
  });
});
