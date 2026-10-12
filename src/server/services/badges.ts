import "server-only";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/guards";

export async function getStudentBadges(userId: string, studentId: string) {
  const messages = await db.message.count({
    where: { thread: { studentId }, senderId: { not: userId }, readAt: null },
  });
  return { messages };
}

export async function getStaffBadges(user: SessionUser, employeeProfileId: string | null) {
  const isManager = user.role === "MANAGER" || user.role === "ADMIN";
  const [messages, leave, awaiting, leads] = await Promise.all([
    employeeProfileId
      ? db.message.count({ where: { thread: { employeeId: employeeProfileId, isActive: true }, senderId: { not: user.id }, readAt: null } })
      : Promise.resolve(0),
    isManager ? db.leaveRequest.count({ where: { status: "PENDING" } }) : Promise.resolve(0),
    isManager ? db.studentProfile.count({ where: { assignmentQueue: "AWAITING" } }) : Promise.resolve(0),
    isManager ? db.lead.count({ where: { status: "NEW" } }) : Promise.resolve(0),
  ]);
  return { messages, leave, awaiting, leads };
}
