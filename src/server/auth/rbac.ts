/**
 * Role-based permissions (SPEC §3). This module is pure so it can be unit
 * tested row by row and imported anywhere (including the edge middleware).
 *
 * Resource-level rules (an employee only sees ASSIGNED students, a student only
 * their OWN data) are enforced separately by guards.ts
 * (`assertEmployeeCanAccessStudent`, `requireOwnStudent`).
 */
import type { Role } from "@/generated/prisma/enums";

export const ROLES = ["STUDENT", "EMPLOYEE", "MANAGER", "ADMIN"] as const satisfies readonly Role[];
export const STAFF_ROLES = ["EMPLOYEE", "MANAGER", "ADMIN"] as const satisfies readonly Role[];

export type Action =
  | "signup.self"
  | "student.dashboard.view_own"
  | "student.profile.edit_own"
  | "vault.manage_own"
  | "vault.reveal" // employee: assigned only, logged
  | "vault.view_metadata" // admin: never secrets
  | "students.view_assigned"
  | "students.view_all"
  | "resume.generate"
  | "application.log"
  | "application.update_status"
  | "application.report_outcome" // student self-reports interview/offer
  | "message.student"
  | "message.employee"
  | "message.view_all"
  | "attendance.self"
  | "leave.apply"
  | "leave.approve"
  | "employee.manage"
  | "assignment.manage"
  | "pricing.manage"
  | "payments.view"
  | "payments.refund"
  | "cms.manage"
  | "resume_styles.manage"
  | "settings.manage"
  | "audit.view"
  | "reports.view"
  | "attendance.manage"
  | "leads.manage"
  | "prep.manage";

const MATRIX: Record<Action, readonly Role[]> = {
  "signup.self": ["STUDENT"],
  "student.dashboard.view_own": ["STUDENT"],
  "student.profile.edit_own": ["STUDENT"],
  "vault.manage_own": ["STUDENT"],
  "vault.reveal": ["EMPLOYEE"],
  "vault.view_metadata": ["ADMIN"],
  "students.view_assigned": ["EMPLOYEE", "MANAGER", "ADMIN"],
  "students.view_all": ["MANAGER", "ADMIN"],
  "resume.generate": ["EMPLOYEE", "MANAGER", "ADMIN"],
  "application.log": ["EMPLOYEE", "MANAGER", "ADMIN"],
  "application.update_status": ["EMPLOYEE", "MANAGER", "ADMIN"],
  "application.report_outcome": ["STUDENT"],
  "message.student": ["EMPLOYEE"],
  "message.employee": ["STUDENT"],
  "message.view_all": ["MANAGER", "ADMIN"],
  "attendance.self": ["EMPLOYEE", "MANAGER", "ADMIN"],
  "leave.apply": ["EMPLOYEE", "MANAGER"],
  "leave.approve": ["MANAGER", "ADMIN"],
  "employee.manage": ["MANAGER", "ADMIN"],
  "assignment.manage": ["MANAGER", "ADMIN"],
  "pricing.manage": ["ADMIN"],
  "payments.view": ["MANAGER", "ADMIN"],
  "payments.refund": ["ADMIN"],
  "cms.manage": ["ADMIN"],
  "resume_styles.manage": ["ADMIN"],
  "settings.manage": ["ADMIN"],
  "audit.view": ["MANAGER", "ADMIN"],
  "reports.view": ["MANAGER", "ADMIN"],
  "attendance.manage": ["MANAGER", "ADMIN"],
  "leads.manage": ["MANAGER", "ADMIN"],
  "prep.manage": ["ADMIN"],
};

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return MATRIX[action].includes(role);
}

export function isStaff(role: Role | null | undefined): boolean {
  return role === "EMPLOYEE" || role === "MANAGER" || role === "ADMIN";
}

/** Which portal prefix each role may open (SPEC §5 middleware). */
export function portalForRole(role: Role): "/app" | "/work" | "/admin" {
  if (role === "STUDENT") return "/app";
  if (role === "EMPLOYEE") return "/work";
  return "/admin";
}

export function canOpenPortal(role: Role, pathname: string): boolean {
  if (pathname === "/app" || pathname.startsWith("/app/")) return role === "STUDENT";
  if (pathname === "/work" || pathname.startsWith("/work/")) return isStaff(role);
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (role === "ADMIN") return true;
    if (role !== "MANAGER") return false;
    return managerMayOpen(pathname);
  }
  return true;
}

/** Admin sections a MANAGER may open ("some MANAGER" in SPEC §5). */
export const MANAGER_ADMIN_PATHS = [
  "/admin",
  "/admin/students",
  "/admin/employees",
  "/admin/assignments",
  "/admin/applications",
  "/admin/attendance",
  "/admin/leave",
  "/admin/payments",
  "/admin/leads",
  "/admin/reports",
  "/admin/audit-log",
] as const;

export function managerMayOpen(pathname: string) {
  if (pathname === "/admin") return true;
  return MANAGER_ADMIN_PATHS.some((p) => p !== "/admin" && (pathname === p || pathname.startsWith(`${p}/`)));
}
