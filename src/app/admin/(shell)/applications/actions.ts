"use server";
import { getTranslations } from "next-intl/server";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { updateStatus, type InterviewInputT } from "@/server/services/applications";

/**
 * Status change from the admin list (MANAGER/ADMIN). Off-matrix moves need
 * `force` + a note (validated in updateStatus).
 */
export async function adminUpdateStatusAction(applicationId: string, to: ApplicationStatus, note: string, force: boolean, interview: InterviewInputT | null) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireRole(["MANAGER", "ADMIN"]);
    return updateStatus(user, { applicationId, to, note: note || null, force, interview });
  }, t("statusChanged"));
}
