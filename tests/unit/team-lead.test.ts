import { beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_SECTIONS,
  adminSectionForPath,
  can,
  canOpenPortal,
  DEFAULT_TEAM_LEAD_SECTIONS,
  GRANTABLE_TEAM_LEAD_SECTIONS,
  isManagerial,
  isStaff,
  normalizeTeamLeadSections,
  portalForRole,
  sectionForAction,
  STAFF_ROLES,
  teamLeadMayOpen,
} from "@/server/auth/rbac";
import { adminNavFor } from "@/components/portal/nav-config";
import { db } from "@/server/db";
import { saveTeamLeadAccess } from "@/server/services/admin-settings";
import { getSetting } from "@/server/services/settings";
import { resetDb } from "../setup/db";

/** Team lead role (D-149): a MANAGER superset without the commercial sections, configurable by an admin. */
describe("TEAM_LEAD defaults", () => {
  it("is staff, lands on /admin and is managerial", () => {
    expect(isStaff("TEAM_LEAD")).toBe(true);
    expect(STAFF_ROLES).toContain("TEAM_LEAD");
    expect(portalForRole("TEAM_LEAD")).toBe("/admin");
    expect(isManagerial("TEAM_LEAD")).toBe(true);
    expect(isManagerial("EMPLOYEE")).toBe(false);
  });

  it("has every MANAGER permission plus content, prep and resume styles — never money or settings", () => {
    const managerActions = ["students.view_all", "students.manage", "employee.manage", "assignment.manage", "leave.approve", "attendance.manage", "reports.view", "audit.view", "leads.manage", "message.view_all", "coach.assign"] as const;
    for (const a of managerActions) expect(can("TEAM_LEAD", a), a).toBe(true);
    for (const a of ["cms.manage", "prep.manage", "resume_styles.manage"] as const) expect(can("TEAM_LEAD", a), a).toBe(true);
    for (const a of ["pricing.manage", "payments.refund", "billing.manage", "settings.manage", "vault.view_metadata", "coach.sessions"] as const) expect(can("TEAM_LEAD", a), a).toBe(false);
  });

  it("defaults to every non-commercial section except Settings", () => {
    expect(DEFAULT_TEAM_LEAD_SECTIONS).toEqual(["students", "employees", "assignments", "applications", "attendance", "leave", "reports", "leads", "cms", "prep", "resume-styles", "audit-log"]);
    expect(GRANTABLE_TEAM_LEAD_SECTIONS).not.toContain("settings");
    expect(GRANTABLE_TEAM_LEAD_SECTIONS).toContain("payments");
  });

  it("opens only granted admin sections (overview always), plus /work; never /app or /coach", () => {
    expect(canOpenPortal("TEAM_LEAD", "/admin")).toBe(true);
    expect(canOpenPortal("TEAM_LEAD", "/admin/students/abc")).toBe(true);
    expect(canOpenPortal("TEAM_LEAD", "/admin/cms/new")).toBe(true);
    expect(canOpenPortal("TEAM_LEAD", "/admin/payments")).toBe(false);
    expect(canOpenPortal("TEAM_LEAD", "/admin/plans")).toBe(false);
    expect(canOpenPortal("TEAM_LEAD", "/admin/settings")).toBe(false);
    expect(canOpenPortal("TEAM_LEAD", "/work/students")).toBe(true);
    expect(canOpenPortal("TEAM_LEAD", "/app")).toBe(false);
    expect(canOpenPortal("TEAM_LEAD", "/coach")).toBe(false);
  });

  it("follows the admin's section list when given", () => {
    expect(canOpenPortal("TEAM_LEAD", "/admin/payments", ["students", "payments"])).toBe(true);
    expect(canOpenPortal("TEAM_LEAD", "/admin/employees", ["students", "payments"])).toBe(false);
    expect(teamLeadMayOpen("/admin/settings", ["settings"])).toBe(true); // path check only; normalize() strips it before it ever gets here
    expect(adminSectionForPath("/admin/resume-styles/x")).toBe("resume-styles");
    expect(adminSectionForPath("/admin")).toBeNull();
    expect(adminSectionForPath("/admin/unknown")).toBeNull();
    // Managers and admins ignore the list.
    expect(canOpenPortal("MANAGER", "/admin/payments", [])).toBe(true);
    expect(canOpenPortal("ADMIN", "/admin/plans", [])).toBe(true);
  });

  it("maps actions to sections for server-action and API checks", () => {
    expect(sectionForAction("payments.view")).toBe("payments");
    expect(sectionForAction("billing.manage")).toBe("payments");
    expect(sectionForAction("employee.manage")).toBe("employees");
    expect(sectionForAction("attendance.self")).toBeNull();
    for (const s of ADMIN_SECTIONS) expect(adminSectionForPath(s.path)).toBe(s.key);
  });

  it("normalizes section lists: drops unknown keys, Settings and duplicates", () => {
    expect(normalizeTeamLeadSections(["students", "nope", "settings", "students", "payments"])).toEqual(["students", "payments"]);
    expect(normalizeTeamLeadSections(undefined)).toEqual([]);
  });

  it("filters the admin nav the same way", () => {
    const def = adminNavFor("TEAM_LEAD").map((i) => i.href);
    expect(def).toContain("/admin");
    expect(def).toContain("/admin/cms");
    expect(def).not.toContain("/admin/payments");
    expect(def).not.toContain("/admin/settings");
    const withMoney = adminNavFor("TEAM_LEAD", ["students", "payments", "plans"]).map((i) => i.href);
    expect(withMoney).toEqual(["/admin", "/admin/students", "/admin/plans", "/admin/payments"]);
  });
});

describe("saveTeamLeadAccess (setting)", () => {
  beforeEach(resetDb);
  it("stores a cleaned list, audit-logs it and reads back with defaults", async () => {
    expect((await getSetting("teamLeadAccess")).sections).toEqual([...DEFAULT_TEAM_LEAD_SECTIONS]);
    const r = await saveTeamLeadAccess("admin-1", { sections: ["payments", "students", "settings", "bogus"] });
    expect(r.sections).toEqual(["students", "payments"]); // canonical (ADMIN_SECTIONS) order
    expect((await getSetting("teamLeadAccess")).sections).toEqual(["students", "payments"]);
    const log = await db.auditLog.findFirst({ where: { action: "settings.team_lead_access" } });
    expect(log).not.toBeNull();
    // Saving the same list again changes nothing.
    expect((await saveTeamLeadAccess("admin-1", { sections: ["students", "payments"] })).changed).toBe(0);
  });
});
