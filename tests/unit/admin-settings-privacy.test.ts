import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { can, managerMayOpen } from "@/server/auth/rbac";
import { saveBusinessInfo, saveGeneralSettings, saveResumeStyle, saveTemplateOverride, setTemplateActive } from "@/server/services/admin-settings";
import { confirmDeletion, saveInternalNotes } from "@/server/services/admin-students";
import { purgeDeletedUsers, PURGED_EMAIL_DOMAIN } from "@/server/services/admin-privacy";
import { jsonDiff } from "@/server/services/admin-audit";
import { getSettings } from "@/server/services/settings";
import { makeEmployee, makeMarket, makeStudent, resetDb } from "../setup/db";

beforeEach(async () => {
  await resetDb();
});

const general = { autoAssignEnabled: false, defaultMaxStudents: 10, noResponseDays: 30, belowTargetAlertTime: "15:00", aiLimits: { employeePerHour: 60, studentPerDay: 300 } };

describe("settings validation + audit", () => {
  it("saves valid settings and audit-logs only what changed", async () => {
    const r = await saveGeneralSettings("admin", general);
    expect(r.changed).toBe(2); // autoAssignEnabled + defaultMaxStudents differ from defaults
    const s = await getSettings();
    expect(s.autoAssignEnabled).toBe(false);
    expect(s.defaultMaxStudents).toBe(10);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "settings.update" } });
    expect(log.before).toMatchObject({ autoAssignEnabled: true, defaultMaxStudents: 8 });
    expect((await saveGeneralSettings("admin", general)).changed).toBe(0);
  });

  it("rejects invalid values", async () => {
    await expect(saveGeneralSettings("admin", { ...general, belowTargetAlertTime: "25:00" })).rejects.toThrow();
    await expect(saveGeneralSettings("admin", { ...general, noResponseDays: 2 })).rejects.toThrow();
    await expect(saveGeneralSettings("admin", { ...general, defaultMaxStudents: 0 })).rejects.toThrow();
    await expect(saveGeneralSettings("admin", { ...general, aiLimits: { employeePerHour: -1, studentPerDay: 10 } })).rejects.toThrow();
  });

  it("stores business info per market and template overrides per known type", async () => {
    await makeMarket("US");
    await saveBusinessInfo("admin", "US", { legalName: "UpayaInd LLC", address: "1 Main St", taxId: "12-345" });
    await expect(saveBusinessInfo("admin", "ZZ", { legalName: "x", address: "", taxId: "" })).rejects.toThrow(/Unknown market/);
    await saveTemplateOverride("admin", "payment_failed", { subject: "Payment issue", body: "" });
    await expect(saveTemplateOverride("admin", "not_a_type", { subject: "x" })).rejects.toThrow(/Unknown notification/);
    const s = await getSettings();
    expect(s.business.US?.legalName).toBe("UpayaInd LLC");
    expect(s.notificationTemplates?.payment_failed).toEqual({ subject: "Payment issue" });
    await saveTemplateOverride("admin", "payment_failed", {});
    expect((await getSettings()).notificationTemplates?.payment_failed).toBeUndefined();
  });
});

describe("resume styles", () => {
  const style = { code: "uk_cv", name: "UK CV", documentTitle: "CV", pageSize: "A4" as const, maxPages: 2, dateFormat: "MMM yyyy" as const, spelling: "en-GB", includePhoto: false, includeDob: false, includeNationality: false, includeFullAddress: false, summaryLabel: "Personal Statement", sectionOrder: ["summary", "experience", "education", "skills"] as ("summary" | "experience" | "education" | "skills")[], rulesPrompt: "British spelling." };
  it("creates, validates the section order and keeps one template active", async () => {
    const r = await saveResumeStyle("admin", style);
    expect((await db.resumeStyle.findUniqueOrThrow({ where: { id: r.id } })).code).toBe("UK_CV");
    await expect(saveResumeStyle("admin", { ...style, code: "X2", sectionOrder: ["summary", "summary", "experience"] })).rejects.toThrow();
    await expect(saveResumeStyle("admin", { ...style, code: "X3", sectionOrder: ["summary", "skills", "education"] })).rejects.toThrow(/Experience/);
    const t = await db.resumeTemplate.create({ data: { code: "classic", name: "Classic" } });
    await expect(setTemplateActive("admin", t.id, false)).rejects.toThrow(/at least one/);
  });
});

describe("RBAC for admin-only sections", () => {
  it("managers can view people/delivery sections but not settings, resume styles or prep", () => {
    for (const a of ["settings.manage", "resume_styles.manage", "prep.manage", "pricing.manage"] as const) {
      expect(can("MANAGER", a)).toBe(false);
      expect(can("ADMIN", a)).toBe(true);
    }
    for (const a of ["employee.manage", "assignment.manage", "reports.view", "audit.view", "leads.manage", "students.view_all"] as const) expect(can("MANAGER", a)).toBe(true);
    expect(managerMayOpen("/admin/settings")).toBe(false);
    expect(managerMayOpen("/admin/resume-styles")).toBe(false);
    expect(managerMayOpen("/admin/prep")).toBe(false);
    expect(managerMayOpen("/admin/students/abc")).toBe(true);
    expect(managerMayOpen("/admin/audit-log")).toBe(true);
  });
});

describe("audit json diff", () => {
  it("lists added, removed and changed paths", () => {
    expect(jsonDiff({ a: 1, b: { c: 2 }, d: "x" }, { a: 1, b: { c: 3 }, e: true })).toEqual([
      { path: "b.c", before: 2, after: 3, kind: "changed" },
      { path: "d", before: "x", after: null, kind: "removed" },
      { path: "e", before: null, after: true, kind: "added" },
    ]);
  });
});

describe("account deletion + purge", () => {
  it("soft-deletes on confirm, then purges after 30 days keeping payments", async () => {
    const m = await makeMarket();
    const emp = await makeEmployee(m.id);
    const s = await makeStudent(m.id, "Priya Sharma");
    await db.user.update({ where: { id: s.user.id }, data: { phone: "+15555550100", deletionRequestedAt: new Date() } });
    await db.assignment.create({ data: { studentId: s.student.id, employeeId: emp.employee.id, source: "AUTO" } });
    await saveInternalNotes("admin", { studentId: s.student.id, notes: "VIP" });
    const plan = await db.plan.create({ data: { code: "p1", name: "P" } });
    const price = await db.planPrice.create({ data: { planId: plan.id, marketId: m.id, interval: "MONTHLY", amountMinor: 9900, currency: "USD", dailyTarget: 10 } });
    const sub = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: price.id, status: "CANCELED", provider: "MANUAL" } });
    await db.payment.create({ data: { studentId: s.student.id, subscriptionId: sub.id, amountMinor: 9900, currency: "USD", status: "SUCCEEDED", provider: "MANUAL", invoiceNumber: "UPY-2026-000001", invoiceKey: "invoices/x.pdf", paidAt: new Date() } });
    await db.fileObject.create({ data: { key: "invoices/x.pdf", ownerUserId: s.user.id, studentId: s.student.id, purpose: "invoice", mime: "application/pdf", size: 1 } });
    await db.fileObject.create({ data: { key: "resumes/y.pdf", ownerUserId: s.user.id, studentId: s.student.id, purpose: "resume", mime: "application/pdf", size: 1 } });

    await confirmDeletion("admin", s.student.id, "Requested by email");
    const after = await db.user.findUniqueOrThrow({ where: { id: s.user.id } });
    expect(after.deletedAt).not.toBeNull();
    expect(after.status).toBe("DEACTIVATED");
    expect(await db.assignment.count({ where: { studentId: s.student.id, isActive: true } })).toBe(0);

    // Not yet 30 days → nothing purged.
    expect((await purgeDeletedUsers()).purged).toBe(0);

    await db.user.update({ where: { id: s.user.id }, data: { deletedAt: new Date(Date.now() - 31 * 86400e3) } });
    expect((await purgeDeletedUsers()).purged).toBe(1);
    const purged = await db.user.findUniqueOrThrow({ where: { id: s.user.id } });
    expect(purged.email).toBe(`deleted+${s.user.id}@${PURGED_EMAIL_DOMAIN}`);
    expect(purged.name).toBe("Deleted user");
    expect(purged.phone).toBeNull();
    expect((await db.studentProfile.findUniqueOrThrow({ where: { id: s.student.id } })).internalNotes).toBeNull();
    // Legally required payment records (and their invoice files) are kept.
    expect(await db.payment.count({ where: { studentId: s.student.id } })).toBe(1);
    expect(await db.fileObject.count({ where: { key: "invoices/x.pdf" } })).toBe(1);
    expect(await db.fileObject.count({ where: { key: "resumes/y.pdf" } })).toBe(0);
    // Idempotent.
    expect((await purgeDeletedUsers()).purged).toBe(0);
  });
});
