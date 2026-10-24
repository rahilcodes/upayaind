import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { db, type Tx } from "@/server/db";
import { isManagerial } from "@/server/auth/rbac";

/** Thrown when a signed-in user may not perform an action (rendered as 403 / error toast). */
export class ForbiddenError extends Error {
  constructor(message = "You don't have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
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
  if (isManagerial(user.role)) {
    const ep = await client.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return { employeeProfileId: ep?.id ?? null };
  }
  if (user.role !== "EMPLOYEE") throw new ForbiddenError();
  const ep = await client.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ep || !(await hasActiveAssignment(ep.id, studentId, client))) {
    throw new ForbiddenError("This applicant isn't assigned to you.");
  }
  return { employeeProfileId: ep.id };
}
