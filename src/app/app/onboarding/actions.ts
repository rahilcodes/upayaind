"use server";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { unstable_update } from "@/server/auth";
import { safeAction, UserError } from "@/server/errors";
import { emit } from "@/server/jobs";
import { fileToBuffer } from "@/server/services/files";
import { completeOnboarding, completeStep } from "@/server/services/onboarding";
import { getParseStatus, saveLinks, saveMasterProfile, savePreferences, storeResumeUpload } from "@/server/services/student-profile";
import { ONBOARDING_STEPS, type LinksInput, type PreferencesInput } from "@/lib/schemas/student";

const stepSchema = z.enum(ONBOARDING_STEPS);

/** Step 1: upload → validate → queue "resume.parse" (the wizard polls parseStatusAction). */
export async function uploadResumeAction(fd: FormData) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    const file = fd.get("file");
    const f = await fileToBuffer(file instanceof File ? file : null);
    if (!f) throw new UserError("Choose your resume file (PDF or DOCX, up to 5 MB).", "file");
    const stored = await storeResumeUpload(user, f);
    await emit("resume.parse", { studentId: stored.studentId, fileId: stored.fileId });
    return { fileId: stored.fileId };
  });
}

export async function parseStatusAction(fileId: string) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    return getParseStatus(user, z.string().min(1).max(40).parse(fileId));
  });
}

export async function saveMasterAction(content: unknown, opts: { advance?: boolean } = {}) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await saveMasterProfile(user, content);
    return { step: opts.advance ? await completeStep(user, "resume") : null };
  }, "Profile saved");
}

export async function savePreferencesAction(input: PreferencesInput, opts: { advance?: boolean } = {}) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await savePreferences(user, input);
    return { step: opts.advance ? await completeStep(user, "preferences") : null };
  }, "Preferences saved");
}

export async function saveLinksAction(input: LinksInput, opts: { advance?: boolean } = {}) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await saveLinks(user, input);
    return { step: opts.advance ? await completeStep(user, "links") : null };
  }, "Links saved");
}

export async function completeStepAction(step: string) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    return { step: await completeStep(user, stepSchema.parse(step)) };
  });
}

/** Step 5: consent + completion, then refresh the JWT so middleware opens /app. */
export async function finishOnboardingAction(consent: boolean) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    const r = await completeOnboarding(user, { consent: z.boolean().parse(consent) });
    await unstable_update({});
    return { completedAt: r.completedAt.toISOString() };
  }, "You're all set!");
}
