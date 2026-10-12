"use server";
import { requireStudent } from "@/server/auth/guards";
import { unstable_update } from "@/server/auth";
import { safeAction } from "@/server/errors";
import { saveLinks, saveMasterProfile, savePersonal, savePreferences } from "@/server/services/student-profile";
import type { LinksInput, PersonalInput, PreferencesInput } from "@/lib/schemas/student";

export async function savePersonalAction(input: PersonalInput) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await savePersonal(user, input);
    // Name/timezone live in the session too.
    await unstable_update({});
    return null;
  }, "Personal details saved");
}

export async function saveProfilePreferencesAction(input: PreferencesInput) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await savePreferences(user, input);
    return null;
  }, "Job preferences saved");
}

export async function saveProfileLinksAction(input: LinksInput) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await saveLinks(user, input);
    return null;
  }, "Links saved");
}

export async function saveProfileMasterAction(content: unknown) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await saveMasterProfile(user, content);
    return null;
  }, "Master profile saved. New tailored resumes will use it.");
}
