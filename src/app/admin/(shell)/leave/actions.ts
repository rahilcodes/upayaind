"use server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { setCover } from "@/server/services/assignment";
import { startOfDayInTz, addDayKey } from "@/lib/dates";
import { db } from "@/server/db";
import { addHoliday, decideLeave, deleteHoliday, saveLeaveType, type HolidayInput, type LeaveTypeInput } from "@/server/services/leave";

export async function decideLeaveAction(id: string, decision: "APPROVED" | "REJECTED", note: string) {
  const t = await getTranslations("work.adminLeave.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    const r = await decideLeave(user, { id, decision, note: note || null });
    return { id: r.id, status: r.status };
  }, decision === "APPROVED" ? t("approved") : t("rejected"));
}

/** Cover during approved leave (F2): COVER assignments for every primary student over the leave window (employee tz). */
export async function setCoverAction(leaveRequestId: string, coverEmployeeId: string) {
  const t = await getTranslations("work.adminLeave.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    const v = z.object({ id: z.string().min(1).max(64), cover: z.string().min(1, "Choose who covers.").max(64) }).parse({ id: leaveRequestId, cover: coverEmployeeId });
    const req = await db.leaveRequest.findUnique({ where: { id: v.id }, select: { status: true, employeeId: true, fromDate: true, toDate: true, employee: { select: { user: { select: { timezone: true } } } } } });
    if (!req || req.status !== "APPROVED") throw new z.ZodError([{ code: "custom", message: "Approve the request before setting cover.", path: ["id"], input: v.id }]);
    const tz = req.employee.user.timezone;
    const from = startOfDayInTz(req.fromDate.toISOString().slice(0, 10), tz);
    const to = startOfDayInTz(addDayKey(req.toDate.toISOString().slice(0, 10), 1), tz);
    return setCover({ primaryEmployeeId: req.employeeId, coverEmployeeId: v.cover, from, to, actorId: user.id, leaveRequestId: v.id });
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
