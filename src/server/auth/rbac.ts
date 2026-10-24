/**
 * Role-based permissions (SPEC §3). This module is pure so it can be unit
 * tested row by row and imported anywhere (including the edge middleware).
 *
 * Resource-level rules (an employee only sees ASSIGNED students, a student only
 * their OWN data) are enforced separately by guards.ts
 * (`assertEmployeeCanAccessStudent`, `requireOwnStudent`).
 *
 * TEAM_LEAD (D-149): runs the business day to day — everything a MANAGER can
 * do plus content, interview prep and resume styles — but never the commercial
 * side (plans, coupons, payments, markets, manual billing) unless an ADMIN
 * switches those sections on. Which admin sections a team lead may open is a
 * setting (`teamLeadAccess.sections`, see ADMIN_SECTIONS) carried in the JWT
 * so the middleware can enforce it per request.
 */
import type { Role } from "@/generated/prisma/enums";

export const ROLES = ["STUDENT", "EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN", "COACH"] as const satisfies readonly Role[];
/** Roles that sign in with password + TOTP and get the 12h staff session (COACH included — D-140). */
export const STAFF_ROLES = ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN", "COACH"] as const satisfies readonly Role[];
/** Staff who work job applications (the /work portal). Interview coaches are not among them. */
export const APPLICATION_STAFF_ROLES = ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN"] as const satisfies readonly Role[];
/** Roles that oversee every student and employee (not scoped to assignments). */
export const MANAGERIAL_ROLES = ["MANAGER", "TEAM_LEAD", "ADMIN"] as const satisfies readonly Role[];

export type Action =
  | "signup.self"
  | "student.dashboard.view_own"
  | "student.profile.edit_own"
  | "vault.manage_own"
  | "vault.reveal" // employee: assigned only, logged
  | "vault.view_metadata" // admin: never secrets
  | "students.view_assigned"
  | "students.view_all"
  | "students.manage" // create students, edit their profile/account (D-147)
  | "billing.manage" // grant/change plans, subscription status, manual payments (D-147)
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
  | "prep.manage"
  | "coach.sessions" // interview coach: own slots, sessions, scorecards
  | "coach.assign"; // assign an interview coach to a student

const MATRIX: Record<Action, readonly Role[]> = {
  "signup.self": ["STUDENT"],
  "student.dashboard.view_own": ["STUDENT"],
  "student.profile.edit_own": ["STUDENT"],
  "vault.manage_own": ["STUDENT"],
  "vault.reveal": ["EMPLOYEE"],
  "vault.view_metadata": ["ADMIN"],
  "students.view_assigned": ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN"],
  "students.view_all": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "students.manage": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "billing.manage": ["ADMIN"],
  "resume.generate": ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN"],
  "application.log": ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN"],
  "application.update_status": ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN"],
  "application.report_outcome": ["STUDENT"],
  "message.student": ["EMPLOYEE"],
  "message.employee": ["STUDENT"],
  "message.view_all": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "attendance.self": ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN"],
  "leave.apply": ["EMPLOYEE", "MANAGER", "TEAM_LEAD"],
  "leave.approve": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "employee.manage": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "assignment.manage": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "pricing.manage": ["ADMIN"],
  "payments.view": ["MANAGER", "TEAM_LEAD", "ADMIN"], // TEAM_LEAD only reaches /admin/payments when the admin enables that section
  "payments.refund": ["ADMIN"],
  "cms.manage": ["TEAM_LEAD", "ADMIN"],
  "resume_styles.manage": ["TEAM_LEAD", "ADMIN"],
  "settings.manage": ["ADMIN"],
  "audit.view": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "reports.view": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "attendance.manage": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "leads.manage": ["MANAGER", "TEAM_LEAD", "ADMIN"],
  "prep.manage": ["TEAM_LEAD", "ADMIN"],
  "coach.sessions": ["COACH", "ADMIN"],
  "coach.assign": ["ADMIN", "MANAGER", "TEAM_LEAD"],
};

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return MATRIX[action].includes(role);
}

export function isStaff(role: Role | null | undefined): boolean {
  return role === "EMPLOYEE" || role === "MANAGER" || role === "TEAM_LEAD" || role === "ADMIN" || role === "COACH";
}

/** MANAGER, TEAM_LEAD or ADMIN: sees every student and employee. */
export function isManagerial(role: Role | null | undefined): boolean {
  return role === "MANAGER" || role === "TEAM_LEAD" || role === "ADMIN";
}

/** Which portal prefix each role may open (SPEC §5 middleware). */
export function portalForRole(role: Role): "/app" | "/work" | "/admin" | "/coach" {
  if (role === "STUDENT") return "/app";
  if (role === "EMPLOYEE") return "/work";
  if (role === "COACH") return "/coach";
  return "/admin";
}

// ───────────────────────────── Admin sections ─────────────────────────────

/**
 * Every admin section with its path and whether it is "commercial" (money).
 * Keys are stable identifiers stored in `settings.teamLeadAccess.sections`.
 */
export const ADMIN_SECTIONS = [
  { key: "students", path: "/admin/students", commercial: false },
  { key: "employees", path: "/admin/employees", commercial: false },
  { key: "assignments", path: "/admin/assignments", commercial: false },
  { key: "applications", path: "/admin/applications", commercial: false },
  { key: "attendance", path: "/admin/attendance", commercial: false },
  { key: "leave", path: "/admin/leave", commercial: false },
  { key: "reports", path: "/admin/reports", commercial: false },
  { key: "plans", path: "/admin/plans", commercial: true },
  { key: "coupons", path: "/admin/coupons", commercial: true },
  { key: "payments", path: "/admin/payments", commercial: true },
  { key: "markets", path: "/admin/markets", commercial: true },
  { key: "leads", path: "/admin/leads", commercial: false },
  { key: "cms", path: "/admin/cms", commercial: false },
  { key: "prep", path: "/admin/prep", commercial: false },
  { key: "resume-styles", path: "/admin/resume-styles", commercial: false },
  { key: "audit-log", path: "/admin/audit-log", commercial: false },
  { key: "settings", path: "/admin/settings", commercial: false },
] as const;
export type AdminSectionKey = (typeof ADMIN_SECTIONS)[number]["key"];

/** Sections a TEAM_LEAD gets until an admin changes them: everything except money and Settings. */
export const DEFAULT_TEAM_LEAD_SECTIONS: readonly AdminSectionKey[] = ADMIN_SECTIONS.filter((s) => !s.commercial && s.key !== "settings").map((s) => s.key);

/** Sections a team lead can be granted at all. Settings holds their own permissions and the business/legal setup, so it stays admin-only. */
export const GRANTABLE_TEAM_LEAD_SECTIONS: readonly AdminSectionKey[] = ADMIN_SECTIONS.filter((s) => s.key !== "settings").map((s) => s.key);

export function isAdminSectionKey(k: string): k is AdminSectionKey {
  return ADMIN_SECTIONS.some((s) => s.key === k);
}

/** The admin section a path belongs to (null for `/admin` itself and unknown paths). */
export function adminSectionForPath(pathname: string): AdminSectionKey | null {
  for (const s of ADMIN_SECTIONS) if (pathname === s.path || pathname.startsWith(`${s.path}/`)) return s.key;
  return null;
}

/** Keep only valid, grantable keys (settings rows may be stale or hand-edited). */
export function normalizeTeamLeadSections(raw: readonly string[] | null | undefined): AdminSectionKey[] {
  const wanted = new Set(raw ?? []);
  // Canonical order (ADMIN_SECTIONS) so two lists with the same sections compare equal.
  return GRANTABLE_TEAM_LEAD_SECTIONS.filter((k) => wanted.has(k));
}

/**
 * The admin section an action lives in, for TEAM_LEAD section checks on
 * server actions and API routes (pages are covered by the middleware path
 * check). Actions without a section (e.g. attendance.self) need none.
 */
const ACTION_SECTION: Partial<Record<Action, AdminSectionKey>> = {
  "students.view_all": "students",
  "students.manage": "students",
  "employee.manage": "employees",
  "assignment.manage": "assignments",
  "coach.assign": "students",
  "leave.approve": "leave",
  "attendance.manage": "attendance",
  "reports.view": "reports",
  "pricing.manage": "plans",
  "payments.view": "payments",
  "payments.refund": "payments",
  "billing.manage": "payments",
  "leads.manage": "leads",
  "cms.manage": "cms",
  "prep.manage": "prep",
  "resume_styles.manage": "resume-styles",
  "audit.view": "audit-log",
  "settings.manage": "settings",
};
export function sectionForAction(action: Action): AdminSectionKey | null {
  return ACTION_SECTION[action] ?? null;
}

/** May a TEAM_LEAD with these sections open this admin path? `/admin` (overview) is always allowed. */
export function teamLeadMayOpen(pathname: string, sections: readonly string[]): boolean {
  if (pathname === "/admin") return true;
  const key = adminSectionForPath(pathname);
  return key !== null && sections.includes(key);
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

/**
 * Portal + section check used by the middleware and the API route guards.
 * `sections` is the TEAM_LEAD's granted admin sections (from the JWT); other
 * roles ignore it.
 */
export function canOpenPortal(role: Role, pathname: string, sections: readonly string[] = DEFAULT_TEAM_LEAD_SECTIONS): boolean {
  if (pathname === "/app" || pathname.startsWith("/app/")) return role === "STUDENT";
  if (pathname === "/work" || pathname.startsWith("/work/")) return role === "EMPLOYEE" || isManagerial(role);
  if (pathname === "/coach" || pathname.startsWith("/coach/")) return role === "COACH" || role === "ADMIN";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (role === "ADMIN") return true;
    if (role === "TEAM_LEAD") return teamLeadMayOpen(pathname, sections);
    if (role !== "MANAGER") return false;
    return managerMayOpen(pathname);
  }
  return true;
}
