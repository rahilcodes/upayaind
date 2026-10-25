"use server";
import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAction, requireRole } from "@/server/auth/guards";
import { getViewAs, issueViewAsToken, VIEW_AS_COOKIE, VIEW_AS_COOKIE_OPTIONS, VIEW_AS_MINUTES } from "@/server/auth/view-as";
import { db } from "@/server/db";
import { safeAction, UserError } from "@/server/errors";
import { requestMeta } from "@/server/request";
import { audit } from "@/server/services/audit";
import { autoAssign, reassign } from "@/server/services/assignment";
import { pauseSubscription, resumeSubscription } from "@/server/services/billing/pause";
import { confirmDeletion, dismissDeletionRequest, restoreDeletedStudent, saveInternalNotes } from "@/server/services/admin-students";
import { assignCoach } from "@/server/services/coach";
import {
  createStudent,
  markEmailVerified,
  reactivateStudent,
  resendStudentInvite,
  resendVerification,
  sendStudentPasswordReset,
  signOutEverywhere,
  suspendStudent,
  updateStudentAccount,
  updateStudentLinks,
  updateStudentPreferences,
  type CreateStudentInput,
  type UpdateStudentAccountInput,
  setStudentPassword,
  type SetPasswordInput,
} from "@/server/services/admin-student-accounts";
import type { LinksInput, PreferencesInput } from "@/lib/schemas/student";

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

/** Set or clear the student's interview coach (ADMIN/MANAGER, D-140). */
export async function assignCoachAction(studentId: string, coachId: string | null) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("coach.assign");
    return assignCoach(user.id, { studentId: id.parse(studentId), coachId: coachId ? id.parse(coachId) : null });
  }, t("coachAssigned"));
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

/** Subscription pause / resume are ADMIN only (SPEC F11, D-121). */
export async function pauseSubscriptionAction(subscriptionId: string, reason: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    return pauseSubscription(user.id, id.parse(subscriptionId), reasonSchema.parse(reason));
  }, t("paused"));
}

export async function resumeSubscriptionAction(subscriptionId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    return resumeSubscription(user.id, id.parse(subscriptionId));
  }, t("resumed"));
}

// ─────────────────────────── View as student (read-only, D-120) ───────────────────────────

/** ADMIN only: open the student portal as this student, read-only, for 30 minutes. */
export async function startViewAsAction(studentId: string) {
  const user = await requireRole(["ADMIN"]);
  const sid = id.parse(studentId);
  const student = await db.studentProfile.findUnique({ where: { id: sid }, select: { id: true, user: { select: { id: true, deletedAt: true } } } });
  if (!student || student.user.deletedAt) throw new UserError("Student not found.");
  const token = await issueViewAsToken(user.id, student.id, student.user.id);
  const meta = await requestMeta();
  await audit({ actorId: user.id, action: "user.view_as", entity: "StudentProfile", entityId: student.id, after: { studentUserId: student.user.id, minutes: VIEW_AS_MINUTES }, ip: meta.ip });
  (await cookies()).set(VIEW_AS_COOKIE, token, VIEW_AS_COOKIE_OPTIONS);
  redirect("/app");
}

// ─────────────────────────── Create / edit students (D-147, MANAGER + ADMIN) ───────────────────────────

export async function createStudentAction(input: CreateStudentInput) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return createStudent(user, input);
  }, t(input.mode === "invite" ? "studentInvited" : "studentCreated"));
}

export async function updateStudentAccountAction(studentId: string, input: UpdateStudentAccountInput) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return updateStudentAccount(user, id.parse(studentId), input);
  }, t("studentSaved"));
}

export async function updateStudentPreferencesAction(studentId: string, input: PreferencesInput) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return updateStudentPreferences(user, id.parse(studentId), input);
  }, t("preferencesSaved"));
}

export async function updateStudentLinksAction(studentId: string, input: LinksInput) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return updateStudentLinks(user, id.parse(studentId), input);
  }, t("linksSaved"));
}

export async function sendStudentPasswordResetAction(studentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return sendStudentPasswordReset(user, id.parse(studentId));
  }, t("passwordResetSent"));
}

export async function setStudentPasswordAction(studentId: string, input: SetPasswordInput) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return setStudentPassword(user, id.parse(studentId), input);
  }, t("studentPasswordSet"));
}

export async function resendStudentInviteAction(studentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return resendStudentInvite(user, id.parse(studentId));
  }, t("inviteSent"));
}

export async function resendStudentVerificationAction(studentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return resendVerification(user, id.parse(studentId));
  }, t("verificationSent"));
}

export async function markStudentVerifiedAction(studentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return markEmailVerified(user, id.parse(studentId));
  }, t("markedVerified"));
}

export async function suspendStudentAction(studentId: string, reason: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return suspendStudent(user, id.parse(studentId), reasonSchema.parse(reason));
  }, t("studentSuspended"));
}

export async function reactivateStudentAction(studentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return reactivateStudent(user, id.parse(studentId));
  }, t("studentReactivated"));
}

export async function signOutStudentEverywhereAction(studentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("students.manage");
    return signOutEverywhere(user, id.parse(studentId));
  }, t("signedOutEverywhere"));
}

/** Leave "view as" and return to Student 360 (the admin session was never changed). */
export async function exitViewAsAction() {
  const v = await getViewAs();
  const jar = await cookies();
  jar.delete(VIEW_AS_COOKIE);
  if (v) {
    await audit({ actorId: v.adminId, action: "user.view_as_exit", entity: "StudentProfile", entityId: v.studentId });
    redirect(`/admin/students/${v.studentId}`);
  }
  redirect("/admin/students");
}
