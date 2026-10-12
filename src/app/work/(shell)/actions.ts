"use server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireStaff } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { clockIn, clockOut, endBreak, startBreak } from "@/server/services/attendance";
import { updateStatus } from "@/server/services/applications";

/** Clock card actions (SPEC F8). */
export async function clockAction(kind: "in" | "out" | "breakStart" | "breakEnd") {
  const t = await getTranslations("work.today.clock.toasts");
  const k = z.enum(["in", "out", "breakStart", "breakEnd"]).parse(kind);
  return safeAction(async () => {
    const { user } = await requireStaff();
    if (k === "in") await clockIn(user);
    else if (k === "out") await clockOut(user);
    else if (k === "breakStart") await startBreak(user);
    else await endBreak(user);
    return null;
  }, t(k));
}

/** Quick status change from student/applications lists (F5 rules enforced by the service). */
export async function quickStatusAction(applicationId: string, to: string, note?: string | null) {
  const t = await getTranslations("work.common");
  return safeAction(async () => {
    const { user } = await requireStaff();
    await updateStatus(user, { applicationId, to: to as never, note: note ?? null });
    return null;
  }, t("statusUpdated"));
}
