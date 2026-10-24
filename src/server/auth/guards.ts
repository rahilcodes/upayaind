import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { auth } from "./index";
import { can, DEFAULT_TEAM_LEAD_SECTIONS, isStaff, ROLES, sectionForAction, type Action } from "./rbac";
import { getViewAs, isServerActionRequest, type ViewAsContext } from "./view-as";

import { ForbiddenError } from "./access";
export { ForbiddenError };

export type SessionUser = {
  id: string;
  role: Role;
  name: string;
  email: string;
  timezone: string;
  onboarded: boolean;
  /** TEAM_LEAD only: admin sections enabled by an admin (D-149). */
  sections?: string[];
  /** Set when an ADMIN is viewing this student's portal read-only (D-120). */
  viewAs?: { adminId: string; adminName: string; studentId: string };
};

function studentFromViewAs(v: ViewAsContext): SessionUser {
  return {
    id: v.studentUserId,
    role: "STUDENT",
    name: v.studentName,
    email: v.studentEmail,
    timezone: v.studentTimezone,
    onboarded: v.onboarded,
    viewAs: { adminId: v.adminId, adminName: v.adminName, studentId: v.studentId },
  };
}

/**
 * The signed-in user, or null. Cached per request. While an admin is
 * "viewing as" a student, this is the student (read-only: see requireRole).
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  const v = await getViewAs();
  if (v) return studentFromViewAs(v);
  return { id: u.id, role: u.role, name: u.name, email: u.email, timezone: u.timezone, onboarded: u.onboarded, sections: u.sections };
});

/**
 * A TEAM_LEAD stands in for a MANAGER everywhere a page or action lists
 * MANAGER (D-149): the role is a superset of MANAGER. Admin-only lists stay
 * admin-only.
 */
function roleAllowed(role: Role, roles: readonly Role[]) {
  return roles.includes(role) || (role === "TEAM_LEAD" && roles.includes("MANAGER"));
}

/**
 * Every server action and protected page starts with this (SPEC §15).
 * Unauthenticated → /login. Staff without a verified 2FA → /2fa.
 * Wrong role → ForbiddenError (rendered as 403).
 */
export async function requireRole(roles: readonly Role[]): Promise<SessionUser> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) redirect("/login");
  if (isStaff(u.role) && u.mfa !== "ok") redirect("/2fa");
  // "View as student": only for student-only contexts, and never for a server action (read-only, D-120).
  if (u.role === "ADMIN" && roles.includes("STUDENT") && !roles.includes("ADMIN")) {
    const v = await getViewAs();
    if (v) {
      if (await isServerActionRequest()) throw new ForbiddenError("You're viewing this account read-only. Exit \"View as student\" to make changes.");
      return studentFromViewAs(v);
    }
  }
  if (!roleAllowed(u.role, roles)) throw new ForbiddenError();
  return { id: u.id, role: u.role, name: u.name, email: u.email, timezone: u.timezone, onboarded: u.onboarded, sections: u.sections };
}

/**
 * Action check. For a TEAM_LEAD the action's admin section must also be
 * enabled by the admin (e.g. `payments.view` needs the "payments" section).
 */
export async function requireAction(action: Action): Promise<SessionUser> {
  const user = await requireRole(ROLES);
  if (!can(user.role, action)) throw new ForbiddenError();
  if (user.role === "TEAM_LEAD") {
    const section = sectionForAction(action);
    if (section && !(user.sections ?? DEFAULT_TEAM_LEAD_SECTIONS).includes(section)) throw new ForbiddenError("An admin has not enabled this section for team leads.");
  }
  return user;
}

/** The signed-in student's profile (id + market). */
export async function requireStudent() {
  const user = await requireRole(["STUDENT"]);
  const student = await db.studentProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, marketId: true, onboardingCompletedAt: true },
  });
  if (!student) redirect("/signup/complete");
  return { user, student };
}

/** The signed-in staff member's employee profile (managers/admins may not have one). Interview coaches are excluded by default (D-140). */
export async function requireStaff(roles: readonly Role[] = ["EMPLOYEE", "MANAGER", "TEAM_LEAD", "ADMIN"]) {
  const user = await requireRole(roles);
  const employee = await db.employeeProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, employeeCode: true, maxStudents: true, marketIds: true, workSchedule: true },
  });
  return { user, employee };
}

export { hasActiveAssignment, assertEmployeeCanAccessStudent } from "./access";
export { assertNotViewAs, getViewAs } from "./view-as";
