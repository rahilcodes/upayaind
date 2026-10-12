"use server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireAction, requireRole } from "@/server/auth/guards";
import { safeAction, UserError } from "@/server/errors";
import { autoAssign, reassign } from "@/server/services/assignment";
import { confirmDeletion, dismissDeletionRequest, restoreDeletedStudent, saveInternalNotes } from "@/server/services/admin-students";

const id = z.string().min(1).max(64);
const reasonSchema = z.string().trim().min(3, "Add a short reason.").max(500);

/** Manual (re)assignment from Student 360 (MANAGER/ADMIN). */
export async function reassignStudentAction(studentId: string, employeeId: string, reason: string, allowOverCapacity: boolean) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("assignment.manage");
    const input = z.object({ studentId: id, employeeId: id, reason: reasonSchema, allowOverCapacity: z.boolean() }).parse({ studentId, employeeId, reason, allowOverCapacity });
    // Only admins may knowingly overfill an employee.
    return reassign({ ...input, allowOverCapacity: input.allowOverCapacity && user.role === "ADMIN", actorId: user.id });
  }, t("reassigned"));
}

export async function autoAssignStudentAction(studentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("assignment.manage");
    const r = await autoAssign(id.parse(studentId), { actorId: user.id, force: true });
    if (r.status === "AWAITING") throw new UserError(t("stillAwaiting", { reason: r.reason }));
    return r;
  }, t("autoAssigned"));
}

export async function saveNotesAction(studentId: string, notes: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.view_all");
    return saveInternalNotes(user.id, { studentId, notes });
  }, t("notesSaved"));
}

/** Deletion handling is ADMIN only (privacy, SPEC §10). */
export async function confirmDeletionAction(studentId: string, note: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    return confirmDeletion(user.id, id.parse(studentId), reasonSchema.parse(note));
  }, t("deletionConfirmed"));
}

export async function dismissDeletionAction(studentId: string, note: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    return dismissDeletionRequest(user.id, id.parse(studentId), reasonSchema.parse(note));
  }, t("deletionDismissed"));
}

export async function restoreStudentAction(studentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    return restoreDeletedStudent(user.id, id.parse(studentId));
  }, t("restored"));
}
