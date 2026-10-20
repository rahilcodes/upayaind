import { describe, expect, it } from "vitest";
import { can, canOpenPortal, isStaff, portalForRole, STAFF_ROLES, type Action } from "@/server/auth/rbac";
import type { Role } from "@/generated/prisma/enums";

/**
 * One assertion per row of the SPEC §3 permissions table.
 * ✅ → allowed, ❌/— → denied. "own"/"assigned" scoping is tested in guards tests.
 */
const S: Role = "STUDENT", E: Role = "EMPLOYEE", M: Role = "MANAGER", A: Role = "ADMIN", C: Role = "COACH";
const table: [string, Action, Role[]][] = [
  ["Sign up themselves", "signup.self", [S]],
  ["View own dashboard / applications", "student.dashboard.view_own", [S]],
  ["Edit own profile, preferences, upload resume", "student.profile.edit_own", [S]],
  ["Add/update credential vault entries", "vault.manage_own", [S]],
  ["Vault reveal (employee, assigned)", "vault.reveal", [E]],
  ["Vault metadata (admin, never secrets)", "vault.view_metadata", [A]],
  ["See assigned students", "students.view_assigned", [E, M, A]],
  ["See all students", "students.view_all", [M, A]],
  ["Generate tailored resumes", "resume.generate", [E, M, A]],
  ["Log / edit applications", "application.log", [E, M, A]],
  ["Update application status", "application.update_status", [E, M, A]],
  ["Student reports interview/offer", "application.report_outcome", [S]],
  ["Message with assigned employee", "message.employee", [S]],
  ["Message with assigned students", "message.student", [E]],
  ["View all threads", "message.view_all", [M, A]],
  ["Clock in/out, own timesheet", "attendance.self", [E, M, A]],
  ["Apply for leave", "leave.apply", [E, M]],
  ["Approve leave", "leave.approve", [M, A]],
  ["Create/deactivate employees", "employee.manage", [M, A]],
  ["Assign / reassign students", "assignment.manage", [M, A]],
  ["Plans, pricing, coupons, markets", "pricing.manage", [A]],
  ["Payments (view)", "payments.view", [M, A]],
  ["Refunds", "payments.refund", [A]],
  ["CMS", "cms.manage", [A]],
  ["Resume styles & templates", "resume_styles.manage", [A]],
  ["Settings", "settings.manage", [A]],
  ["Audit log (view)", "audit.view", [M, A]],
  ["Interview prep admin", "prep.manage", [A]],
  ["Coach: own slots, sessions, scorecards (D-140)", "coach.sessions", [C, A]],
  ["Assign an interview coach (D-140)", "coach.assign", [A, M]],
];

describe("RBAC matrix (SPEC §3)", () => {
  for (const [label, action, allowed] of table) {
    for (const role of [S, E, M, A, C]) {
      const expected = allowed.includes(role);
      it(`${label}: ${role} → ${expected ? "allowed" : "denied"}`, () => {
        expect(can(role, action)).toBe(expected);
      });
    }
  }
  it("denies anonymous users everything", () => {
    for (const [, action] of table) expect(can(null, action)).toBe(false);
  });
});

describe("portal routing (SPEC §5 middleware)", () => {
  it("lands each role on its portal", () => {
    expect(portalForRole(S)).toBe("/app");
    expect(portalForRole(E)).toBe("/work");
    expect(portalForRole(M)).toBe("/admin");
    expect(portalForRole(A)).toBe("/admin");
    expect(portalForRole(C)).toBe("/coach");
  });
  it("interview coaches are staff (TOTP, 12h session) but only open /coach (D-140)", () => {
    expect(isStaff(C)).toBe(true);
    expect(STAFF_ROLES).toContain("COACH");
    expect(canOpenPortal(C, "/coach")).toBe(true);
    expect(canOpenPortal(C, "/coach/sessions")).toBe(true);
    expect(canOpenPortal(C, "/work")).toBe(false);
    expect(canOpenPortal(C, "/work/students")).toBe(false);
    expect(canOpenPortal(C, "/admin")).toBe(false);
    expect(canOpenPortal(C, "/app")).toBe(false);
    expect(canOpenPortal(A, "/coach/applicants")).toBe(true);
    expect(canOpenPortal(M, "/coach")).toBe(false);
    expect(canOpenPortal(E, "/coach")).toBe(false);
    expect(canOpenPortal(S, "/coach")).toBe(false);
  });
  it("keeps students out of staff portals and staff out of /app", () => {
    expect(canOpenPortal(S, "/work")).toBe(false);
    expect(canOpenPortal(S, "/admin/students")).toBe(false);
    expect(canOpenPortal(E, "/app")).toBe(false);
    expect(canOpenPortal(E, "/admin")).toBe(false);
    expect(canOpenPortal(E, "/work/students")).toBe(true);
  });
  it("lets managers into people/delivery admin sections only", () => {
    expect(canOpenPortal(M, "/admin")).toBe(true);
    expect(canOpenPortal(M, "/admin/employees/abc")).toBe(true);
    expect(canOpenPortal(M, "/admin/attendance")).toBe(true);
    expect(canOpenPortal(M, "/admin/plans")).toBe(false);
    expect(canOpenPortal(M, "/admin/settings")).toBe(false);
    expect(canOpenPortal(M, "/admin/cms")).toBe(false);
    expect(canOpenPortal(A, "/admin/plans")).toBe(true);
  });
  it("does not confuse prefixes", () => {
    expect(canOpenPortal(S, "/application-guide")).toBe(true);
    expect(canOpenPortal(E, "/administrator")).toBe(true);
  });
});
