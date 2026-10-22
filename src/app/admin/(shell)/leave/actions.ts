"use server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { applyCover, CoverEntry } from "@/server/services/assignment";
import { addHoliday, decideLeave, deleteHoliday, planCover, saveLeaveType, type HolidayInput, type LeaveTypeInput } from "@/server/services/leave";

const idSchema = z.string().min(1).max(64);
const covers = z.array(CoverEntry).max(500);
type Covers = z.input<typeof covers>;

/** Approve (optionally with a per-applicant cover plan, applied in the same transaction — D-144) or reject. */
export async function decideLeaveAction(leaveRequestId: string, decision: "APPROVED" | "REJECTED", note: string, coverPlan?: Covers) {
  const t = await getTranslations("work.adminLeave.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    const r = await decideLeave(user, { id: leaveRequestId, decision, note: note || null, covers: decision === "APPROVED" && coverPlan ? covers.parse(coverPlan) : undefined });
    return { id: r.id, status: r.status };
  }, decision === "REJECTED" ? t("rejected") : coverPlan?.length ? t("approvedWithCover") : t("approved"));
}

/** Applicants, candidates and suggested covers for the dialog (fetched on open, not per card). */
export async function coverPlanAction(leaveRequestId: string) {
  return safeAction(async () => {
    await requireRole(["MANAGER", "ADMIN"]);
    return planCover(idSchema.parse(leaveRequestId));
  });
}

/** Change the cover of an approved leave (ends rows not in the plan, creates missing ones). */
export async function applyCoverAction(leaveRequestId: string, coverPlan: Covers) {
  const t = await getTranslations("work.adminLeave.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    const r = await applyCover(user, { leaveRequestId: idSchema.parse(leaveRequestId), covers: covers.parse(coverPlan) });
    return { created: r.created, ended: r.ended };
  }, t("cover"));
}

export async function saveLeaveTypeAction(input: z.input<typeof LeaveTypeInput>) {
  const t = await getTranslations("work.adminLeave.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    return saveLeaveType(user, input);
  }, t("typeSaved"));
}

export async function addHolidayAction(input: z.input<typeof HolidayInput>) {
  const t = await getTranslations("work.adminLeave.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    return addHoliday(user, input);
  }, t("holidayAdded"));
}

export async function deleteHolidayAction(id: string) {
  const t = await getTranslations("work.adminLeave.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    return deleteHoliday(user, z.string().min(1).max(64).parse(id));
  }, t("holidayDeleted"));
}
