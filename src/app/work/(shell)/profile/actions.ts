"use server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signOut, signSessionVersionProof, unstable_update } from "@/server/auth";
import { requireStaff } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { bumpSessionVersion, regenerateBackupCodes } from "@/server/services/accounts";
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
    const { sessionVersion } = await changeMyPassword(user, input);
    // Other devices are signed out; this one adopts the new session version (D-124).
    await unstable_update({ svProof: signSessionVersionProof(user.id, sessionVersion) } as never);
    return null;
  }, t("password"));
}

/** New one-time backup codes (password confirmation required). Returned once, never stored in plain text. */
export async function regenerateBackupCodesAction(password: string) {
  const t = await getTranslations("work.profile.toasts");
  return safeAction(async () => {
    const { user } = await requireStaff();
    return regenerateBackupCodes(user.id, z.string().min(1, "Enter your password.").max(256).parse(password));
  }, t("backupCodes"));
}

/** "Log out of all devices": bump the session version, then end this session too. */
export async function logoutEverywhereAction() {
  const { user } = await requireStaff();
  await bumpSessionVersion(user.id);
  await signOut({ redirect: false });
  redirect("/login?team=1");
}
