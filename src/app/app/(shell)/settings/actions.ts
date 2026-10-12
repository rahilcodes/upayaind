"use server";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { cancelAccountDeletion, changePassword, requestAccountDeletion, saveEmailPrefs } from "@/server/services/student-privacy";

export async function changePasswordAction(input: { current?: string; password: string; confirm: string }) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await changePassword(user, input);
    return null;
  }, "Password updated");
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
