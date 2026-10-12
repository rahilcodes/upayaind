"use server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireAction } from "@/server/auth/guards";
import { safeAction, UserError } from "@/server/errors";
import { fileToBuffer } from "@/server/services/files";
import { createSlots, deletePrep, deleteSlot, recordMockOutcome, savePrep, setPrepPublished, uploadPrepFile, type PrepInput, type scorecardSchema, type slotInputSchema } from "@/server/services/admin-prep";

/** Interview prep admin: ADMIN only (rbac "prep.manage"). */

export async function savePrepAction(input: PrepInput) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("prep.manage");
    return savePrep(user.id, input);
  }, t("prepSaved"));
}

export async function publishPrepAction(id: string, isPublished: boolean) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("prep.manage");
    return setPrepPublished(user.id, z.string().min(1).parse(id), z.boolean().parse(isPublished));
  }, t("prepPublished"));
}

export async function deletePrepAction(id: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("prep.manage");
    return deletePrep(user.id, z.string().min(1).parse(id));
  }, t("prepDeleted"));
}

export async function uploadPrepFileAction(form: FormData) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("prep.manage");
    const file = form.get("file");
    const f = await fileToBuffer(file instanceof File ? file : null);
    if (!f) throw new UserError("Choose a PDF to upload.", "file");
    return uploadPrepFile(user.id, f);
  }, t("fileUploaded"));
}

export async function createSlotsAction(input: z.input<typeof slotInputSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("prep.manage");
    return createSlots(user.id, input);
  }, t("slotsCreated"));
}

export async function recordOutcomeAction(input: z.input<typeof scorecardSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("prep.manage");
    return recordMockOutcome(user.id, input);
  }, t("outcomeSaved"));
}

export async function deleteSlotAction(id: string) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("prep.manage");
    return deleteSlot(user.id, z.string().min(1).parse(id));
  }, t("slotDeleted"));
}
