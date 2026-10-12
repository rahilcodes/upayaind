import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { db, type Tx } from "@/server/db";
import { auth } from "./index";
import { can, isStaff, type Action } from "./rbac";

export class ForbiddenError extends Error {
  constructor(message = "You don't have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type SessionUser = {
  id: string;
  role: Role;
  name: string;
  email: string;
  timezone: string;
  onboarded: boolean;
};

/** The signed-in user, or null. Cached per request. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) return null;
  return { id: u.id, role: u.role, name: u.name, email: u.email, timezone: u.timezone, onboarded: u.onboarded };
});

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
  if (!roles.includes(u.role)) throw new ForbiddenError();
  return { id: u.id, role: u.role, name: u.name, email: u.email, timezone: u.timezone, onboarded: u.onboarded };
}

export async function requireAction(action: Action): Promise<SessionUser> {
  const user = await requireRole(["STUDENT", "EMPLOYEE", "MANAGER", "ADMIN"]);
  if (!can(user.role, action)) throw new ForbiddenError();
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

/** The signed-in staff member's employee profile (managers/admins may not have one). */
export async function requireStaff(roles: readonly Role[] = ["EMPLOYEE", "MANAGER", "ADMIN"]) {
  const user = await requireRole(roles);
  const employee = await db.employeeProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, employeeCode: true, maxStudents: true, marketIds: true, workSchedule: true },
  });
  return { user, employee };
}

/**
 * Is there an active assignment between this employee and student right now?
 * PRIMARY assignments are active while `isActive`; COVER assignments only
 * inside their [startsAt, endsAt] window (SPEC F2).
 */
export async function hasActiveAssignment(employeeProfileId: string, studentId: string, client: Tx | typeof db = db) {
  const now = new Date();
  const found = await client.assignment.findFirst({
    where: {
      employeeId: employeeProfileId,
      studentId,
      isActive: true,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    select: { id: true },
  });
  return Boolean(found);
}

/**
 * Row-level rule (SPEC §3): an employee may read or write a student's data only
 * while an active assignment exists. Managers and admins may access every student.
 * Call this in every service that touches student data on behalf of staff.
 */
export async function assertEmployeeCanAccessStudent(
  user: { id: string; role: Role },
  studentId: string,
  client: Tx | typeof db = db,
): Promise<{ employeeProfileId: string | null }> {
  if (user.role === "MANAGER" || user.role === "ADMIN") {
    const ep = await client.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return { employeeProfileId: ep?.id ?? null };
  }
  if (user.role !== "EMPLOYEE") throw new ForbiddenError();
  const ep = await client.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ep || !(await hasActiveAssignment(ep.id, studentId, client))) {
    throw new ForbiddenError("This student isn't assigned to you.");
  }
  return { employeeProfileId: ep.id };
}
