"use server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireAction } from "@/server/auth/guards";
import { safeAction, UserError } from "@/server/errors";
import { autoAssign, reassign } from "@/server/services/assignment";
import { endCover, saveAssignmentRules } from "@/server/services/admin-assignments";

const id = z.string().min(1).max(64);

/** One-click Auto-assign (force) for a queued student (MANAGER/ADMIN). */
export async function autoAssignAction(studentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("assignment.manage");
    const r = await autoAssign(id.parse(studentId), { actorId: user.id, force: true });
    if (r.status === "AWAITING") throw new UserError(t("stillAwaiting", { reason: r.reason }));
    return r;
  }, t("autoAssigned"));
}

/** Auto-assign every queued student (stops reporting at the first that still can't be placed). */
export async function autoAssignAllAction(studentIds: string[]) {
  const t = await getTranslations("admin.assignments");
  return safeAction(async () => {
    const user = await requireAction("assignment.manage");
    const ids = z.array(id).max(100).parse(studentIds);
    let assigned = 0;
    for (const s of ids) {
      const r = await autoAssign(s, { actorId: user.id, force: true });
      if (r.status === "ASSIGNED" || r.status === "ALREADY_ASSIGNED") assigned++;
    }
    return { assigned, left: ids.length - assigned };
  }).then(async (r) => (r.ok ? { ...r, message: t("bulkResult", { assigned: r.data.assigned, left: r.data.left }) } : r));
}

export async function manualAssignAction(studentId: string, employeeId: string, reason: string, allowOverCapacity: boolean) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("assignment.manage");
    const input = z.object({ studentId: id, employeeId: id, reason: z.string().trim().min(3, "Add a short reason.").max(500), allowOverCapacity: z.boolean() }).parse({ studentId, employeeId, reason, allowOverCapacity });
    return reassign({ ...input, allowOverCapacity: input.allowOverCapacity && user.role === "ADMIN", actorId: user.id });
  }, t("reassigned"));
}

/** Rules panel: ADMIN only (settings). */
export async function saveRulesAction(autoAssignEnabled: boolean, defaultMaxStudents: number) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("settings.manage");
    return saveAssignmentRules(user.id, { autoAssignEnabled, defaultMaxStudents });
  }, t("rulesSaved"));
}

export async function endCoverAction(assignmentId: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("assignment.manage");
    return endCover(user.id, id.parse(assignmentId));
  }, t("coverEnded"));
}
