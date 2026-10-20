"use server";
import { getTranslations } from "next-intl/server";
import type { z } from "zod";
import { requireAction } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { saveReferralSettings, type referralSettingsSchema } from "@/server/services/referrals";
import { saveAlertWebhooks, saveBusinessInfo, saveGeneralSettings, savePublicSiteSettings, saveTemplateOverride, type businessEntrySchema, type generalSettingsSchema, type publicSiteSchema, type templateOverrideSchema } from "@/server/services/admin-settings";
import { sendTestAlert, type AlertWebhook } from "@/server/services/alerts";
import { UserError } from "@/server/errors";

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

export async function saveReferralAction(input: z.input<typeof referralSettingsSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("settings.manage");
    return saveReferralSettings(user.id, input);
  }, t("referralSaved"));
}

export async function savePublicSiteAction(input: z.input<typeof publicSiteSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("settings.manage");
    return savePublicSiteSettings(user.id, input);
  }, t("publicSiteSaved"));
}

export async function saveAlertWebhooksAction(hooks: AlertWebhook[]) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("settings.manage");
    return saveAlertWebhooks(user.id, hooks);
  }, t("webhooksSaved"));
}

export async function sendTestAlertAction(url: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("settings.manage");
    try {
      return await sendTestAlert(url, user.name);
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : "Test alert failed.");
    }
  }, t("testAlertSent"));
}
