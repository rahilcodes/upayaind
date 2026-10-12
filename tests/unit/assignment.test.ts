import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { autoAssign, rankCandidates, reassign, setCover, rehomeEmployeeStudents } from "@/server/services/assignment";
import { hasActiveAssignment } from "@/server/auth/access";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
});

describe("rankCandidates (F2 tie-breakers)", () => {
  it("orders by active, then recent, then oldest lastAssignedAt", () => {
    const d = (s: string) => new Date(s);
    const rows = [
      { id: "a", active: 3, recent: 0, lastAssignedAt: null },
      { id: "b", active: 2, recent: 2, lastAssignedAt: d("2026-01-01") },
      { id: "c", active: 2, recent: 1, lastAssignedAt: d("2026-02-01") },
      { id: "d", active: 2, recent: 1, lastAssignedAt: d("2026-01-15") },
    ];
    expect(rankCandidates(rows).map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("autoAssign (F2)", () => {
  it("picks the least-loaded employee and creates a message thread", async () => {
    const m = await makeMarket();
    const busy = await makeEmployee(m.id);
    const free = await makeEmployee(m.id);
    const existing = await makeStudent(m.id);
    await db.assignment.create({ data: { studentId: existing.student.id, employeeId: busy.employee.id, source: "AUTO" } });
    const s = await makeStudent(m.id);
    const r = await autoAssign(s.student.id, { notifyPeople: false });
    expect(r).toMatchObject({ status: "ASSIGNED", employeeId: free.employee.id });
    expect(await db.messageThread.count({ where: { studentId: s.student.id, employeeId: free.employee.id, isActive: true } })).toBe(1);
  });

  it("is idempotent for an already-assigned student", async () => {
    const m = await makeMarket();
    await makeEmployee(m.id);
    const s = await makeStudent(m.id);
    const a = await autoAssign(s.student.id, { notifyPeople: false });
    const b = await autoAssign(s.student.id, { notifyPeople: false });
    expect(b.status).toBe("ALREADY_ASSIGNED");
    expect(a.status === "ASSIGNED" && b.status === "ALREADY_ASSIGNED" && a.employeeId === b.employeeId).toBe(true);
  });

  it("queues as AWAITING when nobody has capacity, is accepting, or serves the market", async () => {
    const m = await makeMarket();
    const other = await makeMarket("UK");
    await makeEmployee(m.id, { maxStudents: 0 });
    await makeEmployee(m.id, { accepting: false });
    await makeEmployee(other.id);
    await makeEmployee(m.id, { status: "DEACTIVATED" });
    const s = await makeStudent(m.id);
    const r = await autoAssign(s.student.id, { notifyPeople: false });
    expect(r.status).toBe("AWAITING");
    const sp = await db.studentProfile.findUniqueOrThrow({ where: { id: s.student.id } });
    expect(sp.assignmentQueue).toBe("AWAITING");
  });

  it("skips employees on approved leave today (M7 acceptance)", async () => {
    const m = await makeMarket();
    const away = await makeEmployee(m.id);
    const here = await makeEmployee(m.id);
    const lt = await db.leaveType.create({ data: { name: "Casual", annualQuota: 12 } });
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    await db.leaveRequest.create({
      data: { employeeId: away.employee.id, leaveTypeId: lt.id, fromDate: new Date(today.getTime() - 2 * 86400e3), toDate: new Date(today.getTime() + 2 * 86400e3), days: 5, reason: "x", status: "APPROVED" },
    });
    for (let i = 0; i < 3; i++) {
      const s = await makeStudent(m.id);
      const r = await autoAssign(s.student.id, { notifyPeople: false });
      expect(r).toMatchObject({ status: "ASSIGNED", employeeId: here.employee.id });
    }
  });

  it("goes to AWAITING when auto-assign is disabled, unless forced", async () => {
    const m = await makeMarket();
    await makeEmployee(m.id);
    await db.setting.create({ data: { key: "autoAssignEnabled", value: false } });
    const s = await makeStudent(m.id);
    expect((await autoAssign(s.student.id, { notifyPeople: false })).status).toBe("AWAITING");
    expect((await autoAssign(s.student.id, { notifyPeople: false, force: true })).status).toBe("ASSIGNED");
  });

  it("M3 acceptance: 20 parallel activations never exceed maxStudents and balance load", async () => {
    const m = await makeMarket();
    const emps = await Promise.all([makeEmployee(m.id, { maxStudents: 8 }), makeEmployee(m.id, { maxStudents: 8 }), makeEmployee(m.id, { maxStudents: 3 })]);
    const students = [];
    for (let i = 0; i < 20; i++) students.push(await makeStudent(m.id, `S${i}`));
    const results = await Promise.all(students.map((s) => autoAssign(s.student.id, { notifyPeople: false })));
    expect(results.filter((r) => r.status === "ASSIGNED")).toHaveLength(19);
    expect(results.filter((r) => r.status === "AWAITING")).toHaveLength(1);
    for (const e of emps) {
      const n = await db.assignment.count({ where: { employeeId: e.employee.id, isActive: true } });
      expect(n).toBeLessThanOrEqual(e.employee.maxStudents);
    }
    const loads = await Promise.all(emps.map((e) => db.assignment.count({ where: { employeeId: e.employee.id, isActive: true } })));
    expect(loads.sort()).toEqual([3, 8, 8]);
    // one primary per student (partial unique index)
    const dup = await db.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*) c FROM (SELECT "studentId" FROM "Assignment" WHERE "isActive" GROUP BY 1 HAVING COUNT(*) > 1) x`;
    expect(Number(dup[0]!.c)).toBe(0);
  });

  it("assigns in least-loaded order when run sequentially", async () => {
    const m = await makeMarket();
    const [a, b] = await Promise.all([makeEmployee(m.id), makeEmployee(m.id)]);
    for (let i = 0; i < 6; i++) await autoAssign((await makeStudent(m.id)).student.id, { notifyPeople: false });
    const la = await db.assignment.count({ where: { employeeId: a.employee.id } });
    const lb = await db.assignment.count({ where: { employeeId: b.employee.id } });
    expect(la).toBe(3);
    expect(lb).toBe(3);
  });
});

describe("reassign, cover, re-home", () => {
  it("reassign closes the old assignment, keeps history, moves the thread", async () => {
    const m = await makeMarket();
    const a = await makeEmployee(m.id);
    const b = await makeEmployee(m.id);
    const s = await makeStudent(m.id);
    await db.setting.create({ data: { key: "autoAssignEnabled", value: true } });
    const r = await autoAssign(s.student.id, { notifyPeople: false });
    const from = r.status === "ASSIGNED" ? r.employeeId : "";
    const to = from === a.employee.id ? b : a;
    const admin = await db.user.create({ data: { email: "adm@t.test", name: "Adm", role: "ADMIN" } });
    await reassign({ studentId: s.student.id, employeeId: to.employee.id, reason: "Load balancing", actorId: admin.id });
    const all = await db.assignment.findMany({ where: { studentId: s.student.id }, orderBy: { createdAt: "asc" } });
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ isActive: false, endReason: "Load balancing" });
    expect(all[1]).toMatchObject({ isActive: true, employeeId: to.employee.id, source: "MANUAL" });
    expect(await hasActiveAssignment(from, s.student.id)).toBe(false);
    expect(await hasActiveAssignment(to.employee.id, s.student.id)).toBe(true);
    const threads = await db.messageThread.findMany({ where: { studentId: s.student.id } });
    expect(threads.filter((t) => t.isActive).map((t) => t.employeeId)).toEqual([to.employee.id]);
  });

  it("cover access exists only inside its window", async () => {
    const m = await makeMarket();
    const p = await makeEmployee(m.id);
    const c = await makeEmployee(m.id);
    const s = await makeStudent(m.id);
    await db.assignment.create({ data: { studentId: s.student.id, employeeId: p.employee.id, source: "AUTO" } });
    const admin = await db.user.create({ data: { email: "adm2@t.test", name: "Adm", role: "ADMIN" } });
    await setCover({ primaryEmployeeId: p.employee.id, coverEmployeeId: c.employee.id, from: new Date(Date.now() - 3600e3), to: new Date(Date.now() + 3600e3), actorId: admin.id });
    expect(await hasActiveAssignment(c.employee.id, s.student.id)).toBe(true);
    await db.assignment.updateMany({ where: { employeeId: c.employee.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(await hasActiveAssignment(c.employee.id, s.student.id)).toBe(false);
  });

  it("re-homes a deactivated employee's students to others", async () => {
    const m = await makeMarket();
    const leaving = await makeEmployee(m.id);
    const staying = await makeEmployee(m.id);
    const s1 = await makeStudent(m.id);
    const s2 = await makeStudent(m.id);
    await db.assignment.createMany({ data: [s1, s2].map((s) => ({ studentId: s.student.id, employeeId: leaving.employee.id, source: "AUTO" as const })) });
    await db.user.update({ where: { id: leaving.user.id }, data: { status: "DEACTIVATED" } });
    const res = await rehomeEmployeeStudents(leaving.employee.id, null);
    expect(res.every((r) => r.status === "ASSIGNED")).toBe(true);
    expect(await db.assignment.count({ where: { employeeId: staying.employee.id, isActive: true } })).toBe(2);
    expect(await db.assignment.count({ where: { employeeId: leaving.employee.id, isActive: true } })).toBe(0);
  });
});
