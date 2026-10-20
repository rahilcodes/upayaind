import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { devOutbox } from "@/server/services/email";
import { createEmployee, deactivateEmployee, nextEmployeeCode, resendInvite, updateEmployee } from "@/server/services/employees";
import { setSetting } from "@/server/services/settings";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
  devOutbox.length = 0;
});

const admin = { id: "admin-actor", role: "ADMIN" as const };
const manager = { id: "manager-actor", role: "MANAGER" as const };

function input(marketId: string, over: Record<string, unknown> = {}) {
  return {
    name: "Neha Iyer",
    email: `neha${Math.random().toString(36).slice(2, 7)}@upaya.test`,
    phone: "",
    title: "Job Application Specialist",
    marketIds: [marketId],
    managerId: null,
    timezone: "Asia/Kolkata",
    schedule: { days: [1, 2, 3, 4, 5], startTime: "09:30", endTime: "18:30", timezone: "Asia/Kolkata", enforceWindow: false },
    role: "EMPLOYEE" as const,
    ...over,
  };
}

describe("employee codes", () => {
  it("continue after the highest existing code and are sequential", async () => {
    const m = await makeMarket();
    const e = await makeEmployee(m.id);
    await db.employeeProfile.update({ where: { id: e.employee.id }, data: { employeeCode: "UPY-0014" } });
    expect(await nextEmployeeCode()).toBe("UPY-0015");
    expect(await nextEmployeeCode()).toBe("UPY-0016");
  });
  it("skips codes already taken by hand", async () => {
    const m = await makeMarket();
    await db.counter.create({ data: { key: "employee_code", value: 4 } });
    const e = await makeEmployee(m.id);
    await db.employeeProfile.update({ where: { id: e.employee.id }, data: { employeeCode: "UPY-0005" } });
    expect(await nextEmployeeCode()).toBe("UPY-0006");
  });
});

describe("createEmployee", () => {
  it("creates an INVITED user with the next code, default maxStudents and an invite email", async () => {
    const m = await makeMarket();
    await setSetting("defaultMaxStudents", 11);
    const r = await createEmployee(admin, input(m.id));
    expect(r.employeeCode).toBe("UPY-0001");
    const u = await db.user.findFirstOrThrow({ where: { employee: { id: r.employeeId } }, select: { status: true, role: true, passwordHash: true, employee: { select: { maxStudents: true, workSchedule: true } } } });
    expect(u.status).toBe("INVITED");
    expect(u.role).toBe("EMPLOYEE");
    expect(u.passwordHash).toBeNull();
    expect(u.employee!.maxStudents).toBe(11);
    // D-139: hours are derived server-side from the clock-in/out window.
    expect(u.employee!.workSchedule).toEqual({ days: [1, 2, 3, 4, 5], startTime: "09:30", endTime: "18:30", timezone: "Asia/Kolkata", enforceWindow: false, hours: 9 });
    expect(await db.authToken.count({ where: { userId: r.userId, type: "INVITE", consumedAt: null } })).toBe(1);
    expect(devOutbox.at(-1)?.text).toMatch(/\/invite\?token=/);
    expect(await db.auditLog.count({ where: { action: "employee.create", entityId: r.employeeId } })).toBe(1);

    const r2 = await createEmployee(admin, input(m.id));
    expect(r2.employeeCode).toBe("UPY-0002");
  });

  it("only lets an admin create a manager", async () => {
    const m = await makeMarket();
    await expect(createEmployee(manager, input(m.id, { role: "MANAGER" }))).rejects.toThrow(/Only an admin/);
    const ok = await createEmployee(admin, input(m.id, { role: "MANAGER" }));
    expect((await db.user.findUniqueOrThrow({ where: { id: ok.userId } })).role).toBe("MANAGER");
  });

  it("rejects duplicate emails and bad schedules", async () => {
    const m = await makeMarket();
    const i = input(m.id);
    await createEmployee(manager, i);
    await expect(createEmployee(manager, { ...i })).rejects.toThrow(/already exists/);
    await expect(createEmployee(manager, input(m.id, { schedule: { days: [], startTime: "9", endTime: "18:00" } }))).rejects.toThrow();
    await expect(createEmployee(manager, input(m.id, { schedule: { days: [1], startTime: "09:00", endTime: "09:30", timezone: "Asia/Kolkata" } }))).rejects.toThrow(/at least 1 hour/);
    await expect(createEmployee(manager, input(m.id, { schedule: { days: [1], startTime: "09:00", endTime: "18:00", timezone: "Mars/Olympus" } }))).rejects.toThrow(/time zone/);
  });

  it("stores an overnight enforced window with derived hours and audits the schedule", async () => {
    const m = await makeMarket();
    const r = await createEmployee(admin, input(m.id, { schedule: { days: [1, 2, 3, 4, 5], startTime: "18:30", endTime: "03:30", timezone: "America/New_York", enforceWindow: true } }));
    const ep = await db.employeeProfile.findUniqueOrThrow({ where: { id: r.employeeId }, select: { workSchedule: true } });
    expect(ep.workSchedule).toMatchObject({ startTime: "18:30", endTime: "03:30", hours: 9, timezone: "America/New_York", enforceWindow: true });
    await updateEmployee(admin, { ...input(m.id), employeeId: r.employeeId, schedule: { days: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00", timezone: "America/New_York", enforceWindow: false } });
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "employee.update", entityId: r.employeeId } });
    expect((log.before as { workSchedule: { enforceWindow: boolean } }).workSchedule.enforceWindow).toBe(true);
    expect((log.after as { workSchedule: { hours: number; enforceWindow: boolean } }).workSchedule).toMatchObject({ hours: 8, enforceWindow: false });
  });

  it("managers can't promote to manager on edit", async () => {
    const m = await makeMarket();
    const r = await createEmployee(admin, input(m.id));
    const base = { ...input(m.id), employeeId: r.employeeId };
    await expect(updateEmployee(manager, { ...base, role: "MANAGER" })).rejects.toThrow(/Only an admin/);
    await updateEmployee(admin, { ...base, role: "MANAGER", maxStudents: 3 });
    expect(await db.auditLog.count({ where: { action: "employee.role_change", entityId: r.employeeId } })).toBe(1);
  });

  it("resends invites only while INVITED", async () => {
    const m = await makeMarket();
    const r = await createEmployee(admin, input(m.id));
    await resendInvite(admin, r.employeeId);
    expect(await db.authToken.count({ where: { userId: r.userId, type: "INVITE", consumedAt: null } })).toBe(1);
    await db.user.update({ where: { id: r.userId }, data: { status: "ACTIVE" } });
    await expect(resendInvite(admin, r.employeeId)).rejects.toThrow(/already activated/);
  });
});

describe("deactivateEmployee", () => {
  it("deactivates and re-homes students through F2", async () => {
    const m = await makeMarket();
    const leaving = await makeEmployee(m.id, { name: "Leaving" });
    const other = await makeEmployee(m.id, { name: "Other" });
    const s1 = await makeStudent(m.id);
    const s2 = await makeStudent(m.id);
    for (const s of [s1, s2]) await db.assignment.create({ data: { studentId: s.student.id, employeeId: leaving.employee.id, source: "AUTO" } });

    const r = await deactivateEmployee(admin, leaving.employee.id, "Left the company");
    expect(r.students).toBe(2);
    expect((await db.user.findUniqueOrThrow({ where: { id: leaving.user.id } })).status).toBe("DEACTIVATED");
    expect(await db.assignment.count({ where: { employeeId: leaving.employee.id, isActive: true } })).toBe(0);
    expect(await db.assignment.count({ where: { employeeId: other.employee.id, isActive: true, type: "PRIMARY" } })).toBe(2);
    expect(await db.auditLog.count({ where: { action: "employee.deactivate", entityId: leaving.employee.id } })).toBe(1);
  });

  it("blocks managers from deactivating managers and anyone from deactivating themselves", async () => {
    const m = await makeMarket();
    const mgr = await makeEmployee(m.id);
    await db.user.update({ where: { id: mgr.user.id }, data: { role: "MANAGER" } });
    await expect(deactivateEmployee(manager, mgr.employee.id, "x")).rejects.toThrow(/Only an admin/);
    await expect(deactivateEmployee({ id: mgr.user.id, role: "ADMIN" }, mgr.employee.id, "x")).rejects.toThrow(/your own/);
  });
});
