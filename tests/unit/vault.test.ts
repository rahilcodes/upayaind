import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { open } from "@/server/crypto";
import {
  addCredential,
  deleteCredential,
  listAccessLog,
  listCredentialsForStaff,
  listOwnCredentials,
  revealCredential,
  revealOwnCredential,
  runCredentialAccessDigest,
  updateCredential,
} from "@/server/services/vault";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => undefined) }));

async function setup() {
  const market = await makeMarket();
  const emp = await makeEmployee(market.id, { name: "Arjun Rao" });
  const other = await makeEmployee(market.id, { name: "Divya Menon" });
  const stu = await makeStudent(market.id, "Priya Sharma");
  const stu2 = await makeStudent(market.id, "Sam Lee");
  const assignment = await db.assignment.create({ data: { studentId: stu.student.id, employeeId: emp.employee.id, source: "AUTO" } });
  const admin = await db.user.create({ data: { email: `admin${Date.now()}@t.test`, name: "Asha Admin", role: "ADMIN" } });
  const manager = await db.user.create({ data: { email: `mgr${Date.now()}@t.test`, name: "Meena Kapoor", role: "MANAGER" } });
  return {
    stu,
    stu2,
    assignment,
    student: { id: stu.user.id, role: "STUDENT" as const },
    student2: { id: stu2.user.id, role: "STUDENT" as const },
    employee: { id: emp.user.id, role: "EMPLOYEE" as const },
    otherEmployee: { id: other.user.id, role: "EMPLOYEE" as const },
    otherEmp: other,
    admin: { id: admin.id, role: "ADMIN" as const },
    manager: { id: manager.id, role: "MANAGER" as const },
  };
}

const ENTRY = { kind: "LINKEDIN" as const, label: "LinkedIn", loginUrl: "linkedin.com/login", username: "priya@example.com", password: "Sup3r-Secret-Pass!", notes: "2FA code arrives by SMS" };

describe("credential vault", () => {
  beforeEach(resetDb);

  it("stores ciphertext only — values are unreadable in the DB", async () => {
    const c = await setup();
    const { id } = await addCredential(c.student, ENTRY);
    const row = await db.credential.findUniqueOrThrow({ where: { id } });
    for (const col of [row.usernameEnc, row.passwordEnc, row.notesEnc!]) {
      expect(col.startsWith("v1.")).toBe(true);
      expect(col).not.toContain("priya");
      expect(col).not.toContain("Secret");
      expect(col).not.toContain("SMS");
    }
    // Raw SQL view of the table: no plaintext anywhere in the row.
    const raw = await db.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "Credential" WHERE id = ${id}`;
    const dump = JSON.stringify(raw);
    expect(dump).not.toContain("priya@example.com");
    expect(dump).not.toContain("Sup3r-Secret-Pass!");
    expect(open(row.passwordEnc)).toBe(ENTRY.password);
    expect(row.loginUrl).toBe("https://linkedin.com/login");
    // Two seals of the same value differ (per-record data keys + random IVs).
    const { id: id2 } = await addCredential(c.student, ENTRY);
    const row2 = await db.credential.findUniqueOrThrow({ where: { id: id2 } });
    expect(row2.passwordEnc).not.toBe(row.passwordEnc);
  });

  it("students see only their own entries, masked; they can reveal their own", async () => {
    const c = await setup();
    const { id } = await addCredential(c.student, ENTRY);
    const list = await listOwnCredentials(c.student);
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/Enc|Secret|priya@/);
    expect(list[0]).toMatchObject({ id, kind: "LINKEDIN", hasNotes: true });
    expect(await listOwnCredentials(c.student2)).toHaveLength(0);
    await expect(revealOwnCredential(c.student2, id)).rejects.toThrow();
    await expect(updateCredential(c.student2, id, { ...ENTRY, password: "" })).rejects.toThrow();
    await expect(deleteCredential(c.student2, id)).rejects.toThrow();
    expect(await revealOwnCredential(c.student, id)).toEqual({ username: ENTRY.username, password: ENTRY.password, notes: ENTRY.notes });
    // Own reveal is not "staff access".
    expect(await db.credentialAccessLog.count()).toBe(0);
  });

  it("update keeps the password when blank; rotation replaces it; delete is soft and wipes secrets", async () => {
    const c = await setup();
    const { id } = await addCredential(c.student, ENTRY);
    await updateCredential(c.student, id, { ...ENTRY, label: "LinkedIn (main)", password: "", keepNotes: true });
    expect(await revealOwnCredential(c.student, id)).toMatchObject({ password: ENTRY.password, notes: ENTRY.notes });
    const r = await updateCredential(c.student, id, { ...ENTRY, password: "N3w-Rotated-Pass", notes: "" });
    expect(r.rotated).toBe(true);
    expect(await revealOwnCredential(c.student, id)).toMatchObject({ password: "N3w-Rotated-Pass", notes: null });
    expect(await db.auditLog.count({ where: { action: "vault.credential_rotated", entityId: id } })).toBe(1);
    await deleteCredential(c.student, id);
    const row = await db.credential.findUniqueOrThrow({ where: { id } });
    expect(row.deletedAt).not.toBeNull();
    expect(open(row.passwordEnc)).toBe("");
    expect(await listOwnCredentials(c.student)).toHaveLength(0);
  });

  it("reveal works only for the actively assigned employee and is logged", async () => {
    const c = await setup();
    const { id } = await addCredential(c.student, ENTRY);
    const meta = await listCredentialsForStaff(c.employee, c.stu.student.id);
    expect(meta.canReveal).toBe(true);
    expect(JSON.stringify(meta)).not.toMatch(/Enc|Secret|priya@/);

    const out = await revealCredential(c.employee, id, "REVEAL", "203.0.113.9");
    expect(out).toMatchObject({ username: ENTRY.username, password: ENTRY.password, notes: ENTRY.notes, hideAfterSeconds: 30 });
    const copyPw = await revealCredential(c.employee, id, "COPY_PASSWORD");
    expect(copyPw.password).toBe(ENTRY.password);
    expect(copyPw.username).toBeUndefined();
    const copyUser = await revealCredential(c.employee, id, "COPY_USERNAME");
    expect(copyUser).toMatchObject({ username: ENTRY.username });
    expect(copyUser.password).toBeUndefined();

    const logs = await db.credentialAccessLog.findMany({ where: { credentialId: id }, orderBy: { at: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["REVEAL", "COPY_PASSWORD", "COPY_USERNAME"]);
    expect(logs[0]).toMatchObject({ userId: c.employee.id, ip: "203.0.113.9" });
    expect(await db.auditLog.count({ where: { action: "vault.reveal", entityId: id } })).toBe(1);

    // The student sees who accessed (first name only).
    const log = await listAccessLog(c.student, c.stu.student.id);
    expect(log).toHaveLength(3);
    expect(log[0]!.by).toBe("Arjun");
    await expect(listAccessLog(c.student2, c.stu.student.id)).rejects.toThrow();
  });

  it("an unassigned employee cannot reveal or list", async () => {
    const c = await setup();
    const { id } = await addCredential(c.student, ENTRY);
    await expect(revealCredential(c.otherEmployee, id, "REVEAL")).rejects.toThrow(/assigned/);
    await expect(listCredentialsForStaff(c.otherEmployee, c.stu.student.id)).rejects.toThrow();
    expect(await db.credentialAccessLog.count()).toBe(0);
  });

  it("admins and managers get metadata + logs, never secrets", async () => {
    const c = await setup();
    const { id } = await addCredential(c.student, ENTRY);
    for (const staff of [c.admin, c.manager]) {
      const meta = await listCredentialsForStaff(staff, c.stu.student.id);
      expect(meta.canReveal).toBe(false);
      expect(meta.credentials).toHaveLength(1);
      expect(JSON.stringify(meta)).not.toMatch(/Enc|Secret|priya@/);
      for (const action of ["REVEAL", "COPY_USERNAME", "COPY_PASSWORD"] as const) {
        await expect(revealCredential(staff, id, action)).rejects.toThrow();
      }
      expect(await listAccessLog(staff, c.stu.student.id)).toEqual([]);
    }
    await expect(revealCredential(c.student, id, "REVEAL")).rejects.toThrow();
    expect(await db.credentialAccessLog.count()).toBe(0);
  });

  it("reassignment removes access immediately; cover assignments only inside their window", async () => {
    const c = await setup();
    const { id } = await addCredential(c.student, ENTRY);
    await revealCredential(c.employee, id, "REVEAL");
    // Reassign to the other employee.
    await db.assignment.update({ where: { id: c.assignment.id }, data: { isActive: false, endsAt: new Date(), endReason: "Reassigned" } });
    await db.assignment.create({ data: { studentId: c.stu.student.id, employeeId: c.otherEmp.employee.id, source: "MANUAL" } });
    await expect(revealCredential(c.employee, id, "REVEAL")).rejects.toThrow();
    await expect(revealCredential(c.employee, id, "COPY_PASSWORD")).rejects.toThrow();
    expect((await revealCredential(c.otherEmployee, id, "COPY_PASSWORD")).password).toBe(ENTRY.password);

    // Expired cover window = no access.
    const third = await makeEmployee((await db.studentProfile.findUniqueOrThrow({ where: { id: c.stu.student.id } })).marketId, { name: "Rahul Verma" });
    await db.assignment.create({ data: { studentId: c.stu.student.id, employeeId: third.employee.id, source: "MANUAL", type: "COVER", startsAt: new Date(Date.now() - 3 * 86400e3), endsAt: new Date(Date.now() - 86400e3) } });
    await expect(revealCredential({ id: third.user.id, role: "EMPLOYEE" }, id, "REVEAL")).rejects.toThrow();
  });

  it("deleted entries can't be revealed", async () => {
    const c = await setup();
    const { id } = await addCredential(c.student, ENTRY);
    await deleteCredential(c.student, id);
    await expect(revealCredential(c.employee, id, "REVEAL")).rejects.toThrow(/deleted/);
  });

  it("daily digest summarises yesterday's access once and marks rows", async () => {
    const c = await setup();
    await db.user.update({ where: { id: c.student.id }, data: { timezone: "America/New_York" } });
    const { id } = await addCredential(c.student, ENTRY);
    await revealCredential(c.employee, id, "REVEAL");
    await revealCredential(c.employee, id, "REVEAL");
    await revealCredential(c.employee, id, "COPY_PASSWORD");
    // Pretend those happened yesterday (NY), and one more access "today".
    const yesterday = new Date("2026-10-11T15:00:00Z");
    await db.credentialAccessLog.updateMany({ data: { at: yesterday } });
    await db.credentialAccessLog.create({ data: { credentialId: id, userId: c.employee.id, action: "REVEAL", at: new Date("2026-10-12T14:00:00Z") } });

    const now = new Date("2026-10-12T15:00:00Z"); // 11:00 in New York
    const r = await runCredentialAccessDigest(now);
    expect(r.sent).toBe(1);
    const n = await db.notification.findFirstOrThrow({ where: { userId: c.student.id, type: "credential_access_digest" } });
    expect(n.body).toContain("Arjun viewed LinkedIn (2×)");
    expect(n.body).toContain("copied the password of LinkedIn");
    expect(await db.credentialAccessLog.count({ where: { digestSentAt: null } })).toBe(1); // today's row waits
    expect((await runCredentialAccessDigest(now)).sent).toBe(0); // idempotent
    expect((await runCredentialAccessDigest(new Date("2026-10-13T15:00:00Z"))).sent).toBe(1);
  });
});
