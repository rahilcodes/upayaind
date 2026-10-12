"use server";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { broadcast } from "@/server/services/messaging";

/** F7 broadcast: one individual message per assigned student. */
export async function broadcastAction(body: string) {
  const t = await getTranslations("messaging.broadcast");
  return safeAction(async () => {
    const { user } = await requireStaff();
    const r = await broadcast(user, String(body ?? ""));
    return r;
  }, t("sent"));
}
