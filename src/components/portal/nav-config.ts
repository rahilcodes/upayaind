import type { Role } from "@/generated/prisma/enums";
import { DEFAULT_TEAM_LEAD_SECTIONS, managerMayOpen, teamLeadMayOpen } from "@/server/auth/rbac";

export type NavIcon =
  | "home" | "list" | "building" | "calendar" | "file" | "message" | "graduation" | "user" | "key" | "card" | "settings"
  | "sun" | "users" | "clock" | "plane" | "chart" | "shuffle" | "tag" | "globe" | "palette" | "inbox" | "pen" | "shield" | "briefcase" | "gift";

export type NavItem = { href: string; label: string; icon: NavIcon; badgeKey?: "messages" | "leave" | "awaiting" | "leads"; group?: string };

export const STUDENT_NAV: NavItem[] = [
  { href: "/app", label: "dashboard", icon: "home" },
  { href: "/app/applications", label: "applications", icon: "list" },
  { href: "/app/companies", label: "companies", icon: "building" },
  { href: "/app/interviews", label: "interviews", icon: "calendar" },
  { href: "/app/resumes", label: "resumes", icon: "file" },
  { href: "/app/messages", label: "messages", icon: "message", badgeKey: "messages" },
  { href: "/app/prep", label: "prep", icon: "graduation" },
  { href: "/app/reports", label: "weeklyReports", icon: "chart" },
  { href: "/app/referrals", label: "referrals", icon: "gift" },
  { href: "/app/profile", label: "profile", icon: "user" },
  { href: "/app/vault", label: "vault", icon: "key" },
  { href: "/app/billing", label: "billing", icon: "card" },
  { href: "/app/settings", label: "settings", icon: "settings" },
];

export const WORK_NAV: NavItem[] = [
  { href: "/work", label: "today", icon: "sun" },
  { href: "/work/students", label: "students", icon: "users" },
  { href: "/work/applications", label: "applications", icon: "list" },
  { href: "/work/interviews", label: "interviews", icon: "calendar" },
  { href: "/work/messages", label: "messages", icon: "message", badgeKey: "messages" },
  { href: "/work/timesheet", label: "timesheet", icon: "clock" },
  { href: "/work/leave", label: "leave", icon: "plane" },
  { href: "/work/profile", label: "profile", icon: "user" },
];

/** Interview coach portal (D-140): sessions and applicants only — no applications, vault or messages. */
export const COACH_NAV: NavItem[] = [
  { href: "/coach", label: "today", icon: "sun" },
  { href: "/coach/sessions", label: "sessions", icon: "calendar" },
  { href: "/coach/applicants", label: "applicants", icon: "users" },
  { href: "/coach/profile", label: "profile", icon: "user" },
];

const ADMIN_NAV_ALL: NavItem[] = [
  { href: "/admin", label: "overview", icon: "chart", group: "work" },
  { href: "/admin/students", label: "allStudents", icon: "graduation", group: "people" },
  { href: "/admin/employees", label: "employees", icon: "users", group: "people" },
  { href: "/admin/assignments", label: "assignments", icon: "shuffle", group: "people", badgeKey: "awaiting" },
  { href: "/admin/applications", label: "allApplications", icon: "list", group: "delivery" },
  { href: "/admin/attendance", label: "attendance", icon: "clock", group: "delivery" },
  { href: "/admin/leave", label: "leaveAdmin", icon: "plane", group: "delivery", badgeKey: "leave" },
  { href: "/admin/reports", label: "reports", icon: "chart", group: "delivery" },
  { href: "/admin/plans", label: "plans", icon: "tag", group: "money" },
  { href: "/admin/coupons", label: "coupons", icon: "tag", group: "money" },
  { href: "/admin/payments", label: "payments", icon: "card", group: "money" },
  { href: "/admin/markets", label: "markets", icon: "globe", group: "money" },
  { href: "/admin/leads", label: "leads", icon: "inbox", group: "content", badgeKey: "leads" },
  { href: "/admin/cms", label: "cms", icon: "pen", group: "content" },
  { href: "/admin/prep", label: "prepAdmin", icon: "graduation", group: "content" },
  { href: "/admin/resume-styles", label: "resumeStyles", icon: "palette", group: "content" },
  { href: "/admin/audit-log", label: "auditLog", icon: "shield", group: "system" },
  { href: "/admin/settings", label: "adminSettings", icon: "settings", group: "system" },
];

export function adminNavFor(role: Role, sections: readonly string[] = DEFAULT_TEAM_LEAD_SECTIONS): NavItem[] {
  if (role === "ADMIN") return ADMIN_NAV_ALL;
  if (role === "TEAM_LEAD") return ADMIN_NAV_ALL.filter((i) => teamLeadMayOpen(i.href, sections));
  return ADMIN_NAV_ALL.filter((i) => managerMayOpen(i.href));
}
