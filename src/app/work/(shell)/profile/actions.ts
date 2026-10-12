"use server";
import { getTranslations } from "next-intl/server";
import { requireStaff } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { changeMyPassword, updateMyWorkProfile } from "@/server/services/work-dashboard";

export async function updateProfileAction(input: { name: string; phone: string; timezone: string }) {
  const t = await getTranslations("work.profile.toasts");
  return safeAction(async () => {
    const { user } = await requireStaff();
    await updateMyWorkProfile(user, input);
    return null;
  }, t("saved"));
}

export async function changePasswordAction(input: { current: string; next: string; confirm: string }) {
  const t = await getTranslations("work.profile.toasts");
  return safeAction(async () => {
    const { user } = await requireStaff();
    await changeMyPassword(user, input);
    return null;
  }, t("password"));
}
