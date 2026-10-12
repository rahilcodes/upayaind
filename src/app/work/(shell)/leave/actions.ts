"use server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireStaff } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { fileToBuffer } from "@/server/services/files";
import { applyLeave, cancelLeave } from "@/server/services/leave";

/** Apply for leave (FormData so an optional attachment can be included). */
export async function applyLeaveAction(fd: FormData) {
  const t = await getTranslations("work.leave.toasts");
  return safeAction(async () => {
    const { user } = await requireStaff(["EMPLOYEE", "MANAGER"]);
    const half = String(fd.get("halfDay") ?? "");
    const file = fd.get("attachment");
    const attachment = file && typeof file !== "string" ? await fileToBuffer(file) : null;
    const r = await applyLeave(
      user,
      {
        leaveTypeId: String(fd.get("leaveTypeId") ?? ""),
        from: String(fd.get("from") ?? ""),
        to: String(fd.get("to") ?? fd.get("from") ?? ""),
        halfDay: half === "FIRST" || half === "SECOND" ? half : null,
        reason: String(fd.get("reason") ?? ""),
      },
      attachment,
    );
    return { id: r.id, days: r.days };
  }, t("applied"));
}

export async function cancelLeaveAction(id: string) {
  const t = await getTranslations("work.leave.toasts");
  return safeAction(async () => {
    const { user } = await requireStaff(["EMPLOYEE", "MANAGER"]);
    await cancelLeave(user, z.string().min(1).max(64).parse(id));
    return null;
  }, t("cancelled"));
}
