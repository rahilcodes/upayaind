"use server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireAction } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { deleteResumeStyle, saveResumeStyle, setTemplateActive, type StyleInput } from "@/server/services/admin-settings";

/** Resume styles & templates: ADMIN only (SPEC §3). */

export async function saveStyleAction(input: StyleInput) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("resume_styles.manage");
    return saveResumeStyle(user.id, input);
  }, t("styleSaved"));
}

export async function deleteStyleAction(id: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("resume_styles.manage");
    return deleteResumeStyle(user.id, z.string().min(1).parse(id));
  }, t("styleDeleted"));
}

export async function toggleTemplateAction(id: string, isActive: boolean) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("resume_styles.manage");
    return setTemplateActive(user.id, z.string().min(1).parse(id), z.boolean().parse(isActive));
  }, t("templateToggled"));
}
