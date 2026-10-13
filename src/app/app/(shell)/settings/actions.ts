"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { signOut, signSessionVersionProof, unstable_update } from "@/server/auth";
import { requireStudent } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { bumpSessionVersion } from "@/server/services/accounts";
import { cancelAccountDeletion, changePassword, requestAccountDeletion, saveEmailPrefs } from "@/server/services/student-privacy";
import { setWhatsAppPref } from "@/server/services/channels/prefs";
import { UserError } from "@/server/errors";

export async function changePasswordAction(input: { current?: string; password: string; confirm: string }) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    const { sessionVersion } = await changePassword(user, input);
    // Other devices are signed out; this one adopts the new session version (D-124).
    await unstable_update({ svProof: signSessionVersionProof(user.id, sessionVersion) } as never);
    return null;
  }, "Password updated");
}

/** "Log out of all devices": bump the session version, then end this session too (D-124). */
export async function logoutEverywhereAction() {
  const { user } = await requireStudent();
  await bumpSessionVersion(user.id);
  await signOut({ redirect: false });
  redirect("/login");
}

export async function saveEmailPrefsAction(input: Record<string, boolean>) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    return saveEmailPrefs(user, z.record(z.string(), z.boolean()).parse(input));
  }, "Email preferences saved");
}

export async function requestDeletionAction(confirmEmail: string) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await requestAccountDeletion(user, z.string().max(254).parse(confirmEmail));
    return null;
  }, "Deletion request received");
}

export async function cancelDeletionAction() {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await cancelAccountDeletion(user);
    return null;
  }, "Deletion request cancelled");
}

/** WhatsApp opt-in (DECISIONS D-133). */
export async function setWhatsAppPrefAction(enabled: boolean) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    try {
      return await setWhatsAppPref(user.id, z.boolean().parse(enabled));
    } catch (e) {
      throw new UserError((e as Error).message);
    }
  }, "WhatsApp preference saved");
}
