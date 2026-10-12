"use server";
import { getTranslations } from "next-intl/server";
import { requireAction } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { updateLead, type leadUpdateSchema } from "@/server/services/leads-admin";
import type { z } from "zod";

export async function updateLeadAction(input: z.input<typeof leadUpdateSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("leads.manage");
    return updateLead(user.id, input);
  }, t("leadSaved"));
}
