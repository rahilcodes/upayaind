import "server-only";
import { db } from "@/server/db";
import { hasActiveAssignment } from "@/server/auth/access";
import type { SessionUser } from "@/server/auth/guards";

const PUBLIC_PURPOSES = new Set(["cms", "public"]);

/**
 * Can this user download the file? (SPEC §10: every download is permission-checked.)
 * - public purposes (CMS images) → anyone
 * - the uploader → yes
 * - files tied to a student → that student, their actively assigned employee, managers/admins
 * - staff-only files (leave attachments) → owner + managers/admins
 */
export async function canAccessFile(user: SessionUser | null, file: { ownerUserId: string; studentId: string | null; purpose: string }) {
  if (PUBLIC_PURPOSES.has(file.purpose)) return true;
  if (!user) return false;
  if (file.ownerUserId === user.id) return true;
  if (user.role === "ADMIN" || user.role === "MANAGER") return true;
  if (!file.studentId) return false;
  if (user.role === "STUDENT") {
    const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    return s?.id === file.studentId;
  }
  if (user.role === "EMPLOYEE") {
    const ep = await db.employeeProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!ep) return false;
    if (await hasActiveAssignment(ep.id, file.studentId)) return true;
    // Employees keep read access to files on applications they logged themselves.
    if (file.purpose === "proof") {
      const n = await db.jobApplication.count({ where: { studentId: file.studentId, employeeId: ep.id } });
      return n > 0;
    }
  }
  return false;
}
