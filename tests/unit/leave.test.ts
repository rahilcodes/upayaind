import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { applyLeave, cancelLeave, computeBalance, countLeaveDays, decideLeave, getBalances, myLeave, planCover } from "@/server/services/leave";
import { applyCover, autoAssign, endExpiredCovers, suggestCovers } from "@/server/services/assignment";
import { hasActiveAssignment } from "@/server/auth/access";
import { dateOnly, dayKey, addDayKey } from "@/lib/dates";
import { makeCoach, makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

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

describe("cover while away (D-144)", () => {
  async function coverSetup() {
    const c = await setup();
    const divya = await makeEmployee(c.m.id, { name: "Divya Menon" });
    const rahul = await makeEmployee(c.m.id, { name: "Rahul Nair" });
    const students = [];
    for (const name of ["Stu A", "Stu B", "Stu C"]) {
      const s = await makeStudent(c.m.id, name);
      await db.assignment.create({ data: { studentId: s.student.id, employeeId: c.e.employee.id, source: "AUTO", type: "PRIMARY" } });
      students.push(s);
    }
    const req = await applyLeave(c.actor, { leaveTypeId: c.casual.id, from: "2026-10-26", to: "2026-10-28", reason: "Trip" }, null, NOW);
    return { ...c, divya, rahul, students, req };
  }
  const notifCount = (type: string) => db.notification.count({ where: { type } });

  it("plan: suggestions spread load across same-market candidates, excluding coaches and colleagues on leave", async () => {
    const c = await coverSetup();
    await makeCoach(c.m.id);
    const away = await makeEmployee(c.m.id, { name: "Away Person" });
    await db.leaveRequest.create({ data: { employeeId: away.employee.id, leaveTypeId: c.casual.id, fromDate: dateOnly("2026-10-27"), toDate: dateOnly("2026-10-27"), days: 1, reason: "x", status: "APPROVED" } });
    const plan = await planCover(c.req.id);
    expect(plan.window.label).toBe("26–28 Oct");
    expect(plan.candidates.map((x) => x.name).sort()).toEqual(["Divya Menon", "Rahul Nair"]);
    expect(plan.students).toHaveLength(3);
    const picks = plan.students.map((s) => s.suggestedCoverId);
    expect(new Set(picks).size).toBe(2); // round-robin across the two equal-load candidates
    // Pure helper: prefers lower load, then spreads ties.
    const sug = suggestCovers(
      [{ studentId: "s1", marketId: "m" }, { studentId: "s2", marketId: "m" }, { studentId: "s3", marketId: "other" }],
      [{ employeeId: "busy", marketIds: ["m"], load: 5, max: 8 }, { employeeId: "free", marketIds: ["m"], load: 1, max: 8 }],
      { s2: "busy" },
    );
    expect(sug).toEqual({ s1: "free", s2: "busy", s3: "free" });
  });

  it("approve + cover in one call creates COVER rows for the window, split across two employees", async () => {
    const c = await coverSetup();
    const [a, b, d] = c.students;
    const r = await decideLeave(c.manager, {
      id: c.req.id,
      decision: "APPROVED",
      note: "Enjoy",
      covers: [
        { studentId: a!.student.id, coverEmployeeId: c.divya.employee.id },
        { studentId: b!.student.id, coverEmployeeId: c.divya.employee.id },
        { studentId: d!.student.id, coverEmployeeId: c.rahul.employee.id },
      ],
    });
    expect(r.cover).toEqual({ created: 3, ended: 0 });
    const rows = await db.assignment.findMany({ where: { leaveRequestId: c.req.id, type: "COVER", isActive: true } });
    expect(rows).toHaveLength(3);
    // Window = start of 26 Oct → start of 29 Oct in Asia/Kolkata (UTC+5:30).
    expect(rows[0]!.startsAt.toISOString()).toBe("2026-10-25T18:30:00.000Z");
    expect(rows[0]!.endsAt!.toISOString()).toBe("2026-10-28T18:30:00.000Z");
    const leave = await db.leaveRequest.findUnique({ where: { id: c.req.id } });
    expect(leave).toMatchObject({ status: "APPROVED", coverEmployeeId: c.divya.employee.id });
    // Notifications: one per cover employee, one per student, one to the employee on leave (+ the decision).
    expect(await notifCount("cover_employee")).toBe(2);
    expect(await notifCount("cover_student")).toBe(3);
    expect(await notifCount("leave_cover_set")).toBe(1);
    expect(await db.notification.count({ where: { userId: c.e.user.id, type: "leave_decision" } })).toBe(1);
    const mine = await db.notification.findFirst({ where: { userId: c.divya.user.id, type: "cover_employee" } });
    expect(mine?.title).toContain("2 applicants for Arjun Rao, 26–28 Oct");
    expect(mine?.link).toBe("/work");
    const stu = await db.notification.findFirst({ where: { userId: a!.user.id, type: "cover_student" } });
    expect(stu?.body).toContain("While Arjun is away (26–28 Oct), Divya will handle");
    // Employee side: who covers whom.
    const my = await myLeave(c.actor);
    expect(my.history[0]!.covers).toEqual([{ employeeId: c.divya.employee.id, name: "Divya Menon", count: 2 }, { employeeId: c.rahul.employee.id, name: "Rahul Nair", count: 1 }]);
  });

  it("rejects a coach, a colleague on overlapping leave, or a student not assigned to the employee — and leaves the request PENDING", async () => {
    const c = await coverSetup();
    const coach = await makeCoach(c.m.id);
    const away = await makeEmployee(c.m.id, { name: "Away Person" });
    await db.leaveRequest.create({ data: { employeeId: away.employee.id, leaveTypeId: c.casual.id, fromDate: dateOnly("2026-10-28"), toDate: dateOnly("2026-10-30"), days: 3, reason: "x", status: "APPROVED" } });
    const other = await makeStudent(c.m.id, "Not Mine");
    const sid = c.students[0]!.student.id;
    await expect(decideLeave(c.manager, { id: c.req.id, decision: "APPROVED", covers: [{ studentId: sid, coverEmployeeId: coach.employee.id }] })).rejects.toThrow(/isn't available/);
    await expect(decideLeave(c.manager, { id: c.req.id, decision: "APPROVED", covers: [{ studentId: sid, coverEmployeeId: away.employee.id }] })).rejects.toThrow(/isn't available/);
    await expect(decideLeave(c.manager, { id: c.req.id, decision: "APPROVED", covers: [{ studentId: other.student.id, coverEmployeeId: c.divya.employee.id }] })).rejects.toThrow(/isn't assigned/);
    await expect(decideLeave(c.manager, { id: c.req.id, decision: "APPROVED", covers: [{ studentId: sid, coverEmployeeId: c.e.employee.id }] })).rejects.toThrow(/different employee/);
    expect((await db.leaveRequest.findUnique({ where: { id: c.req.id } }))?.status).toBe("PENDING");
    expect(await db.assignment.count({ where: { type: "COVER" } })).toBe(0);
    await expect(applyCover(c.manager, { leaveRequestId: c.req.id, covers: [] })).rejects.toThrow(/Approve the request/);
  });

  it("re-applying a changed plan ends old rows and creates new ones without duplicates; no-op plans don't notify again", async () => {
    const c = await coverSetup();
    const [a, b, d] = c.students;
    const toDivya = (s: typeof a) => ({ studentId: s!.student.id, coverEmployeeId: c.divya.employee.id });
    await decideLeave(c.manager, { id: c.req.id, decision: "APPROVED", covers: [toDivya(a), toDivya(b), toDivya(d)] });
    expect(await notifCount("cover_employee")).toBe(1);
    // Same plan again: nothing changes, nobody is notified.
    const same = await applyCover(c.manager, { leaveRequestId: c.req.id, covers: [toDivya(a), toDivya(b), toDivya(d)] });
    expect(same).toMatchObject({ created: 0, ended: 0 });
    expect(await notifCount("cover_employee")).toBe(1);
    // Move C to Rahul and drop B.
    const changed = await applyCover(c.manager, { leaveRequestId: c.req.id, covers: [toDivya(a), { studentId: d!.student.id, coverEmployeeId: c.rahul.employee.id }] });
    expect(changed).toMatchObject({ created: 1, ended: 2 });
    const active = await db.assignment.findMany({ where: { leaveRequestId: c.req.id, type: "COVER", isActive: true }, orderBy: { createdAt: "asc" } });
    expect(active.map((x) => [x.studentId, x.employeeId])).toEqual([[a!.student.id, c.divya.employee.id], [d!.student.id, c.rahul.employee.id]]);
    const ended = await db.assignment.findMany({ where: { leaveRequestId: c.req.id, isActive: false } });
    expect(ended).toHaveLength(2);
    expect(ended.every((x) => x.endReason === "Cover changed")).toBe(true);
    expect(await db.assignment.count({ where: { leaveRequestId: c.req.id } })).toBe(4);
    // Majority cover is a tie (1/1) → deterministic; the plan is now pre-selected in planCover.
    const plan = await planCover(c.req.id);
    expect(plan.students.find((s) => s.studentId === d!.student.id)).toMatchObject({ currentCoverId: c.rahul.employee.id, suggestedCoverId: c.rahul.employee.id });
    expect(await notifCount("cover_employee")).toBe(3);
    expect(await notifCount("cover_student")).toBe(4); // 3 at first, +1 for C's new cover
    expect(await notifCount("leave_cover_set")).toBe(2);
    // Empty plan clears the primary cover marker.
    await applyCover(c.manager, { leaveRequestId: c.req.id, covers: [] });
    expect((await db.leaveRequest.findUnique({ where: { id: c.req.id } }))?.coverEmployeeId).toBeNull();
    expect(await db.assignment.count({ where: { leaveRequestId: c.req.id, isActive: true } })).toBe(0);
  });

  it("endExpiredCovers flips rows whose window has passed; cover grants access only inside the window", async () => {
    const c = await coverSetup();
    const sid = c.students[0]!.student.id;
    await decideLeave(c.manager, { id: c.req.id, decision: "APPROVED", covers: [{ studentId: sid, coverEmployeeId: c.divya.employee.id }] });
    expect(await hasActiveAssignment(c.divya.employee.id, sid)).toBe(false); // leave hasn't started (test clock is real time)
    expect(await endExpiredCovers(new Date("2026-10-28T00:00:00Z"))).toBe(0);
    expect(await endExpiredCovers(new Date("2026-10-29T00:00:00Z"))).toBe(1);
    const row = await db.assignment.findFirst({ where: { leaveRequestId: c.req.id } });
    expect(row).toMatchObject({ isActive: false, endReason: "Leave ended" });
    expect(await endExpiredCovers(new Date("2026-10-29T00:00:00Z"))).toBe(0);
  });
});
