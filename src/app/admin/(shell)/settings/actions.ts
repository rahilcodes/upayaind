"use server";
import { getTranslations } from "next-intl/server";
import type { z } from "zod";
import { requireAction } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { saveBusinessInfo, saveGeneralSettings, saveTemplateOverride, type businessEntrySchema, type generalSettingsSchema, type templateOverrideSchema } from "@/server/services/admin-settings";

/** Settings are ADMIN only (SPEC §3). Every change is audit-logged in the service. */

export async function saveGeneralAction(input: z.input<typeof generalSettingsSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("settings.manage");
    return saveGeneralSettings(user.id, input);
  }, t("settingsSaved"));
}

export async function saveBusinessAction(marketCode: string, input: z.input<typeof businessEntrySchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("settings.manage");
    return saveBusinessInfo(user.id, marketCode, input);
  }, t("businessSaved"));
}

export async function saveTemplateAction(type: string, input: z.input<typeof templateOverrideSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("settings.manage");
    return saveTemplateOverride(user.id, type, input);
  }, t("templateSaved"));
}
