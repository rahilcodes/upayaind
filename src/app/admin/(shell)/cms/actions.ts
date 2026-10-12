"use server";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { requestMeta } from "@/server/request";
import * as cms from "@/server/services/cms";
import { enforceRateLimit } from "@/server/services/ratelimit";
import { fileToBuffer } from "@/server/services/files";

/** CMS admin actions (SPEC §11). ADMIN only; logic lives in src/server/services/cms.ts. */

export async function saveEntryAction(input: cms.EntryInput) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    const saved = await cms.saveEntry({ id: user.id, name: user.name }, input);
    return { id: saved.id, slug: saved.slug };
  }, "Saved");
}

export async function publishAction(id: string, publish: boolean) {
  return safeAction(
    async () => {
      const user = await requireRole(["ADMIN"]);
      await cms.setPublished(user, z.string().min(1).parse(id), z.boolean().parse(publish));
      return null;
    },
    publish ? "Published" : "Unpublished",
  );
}

export async function deleteEntryAction(id: string) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    await cms.softDelete(user, z.string().min(1).parse(id));
    return null;
  }, "Deleted");
}

export async function restoreRevisionAction(id: string, index: number) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    await cms.restoreRevision({ id: user.id, name: user.name }, z.string().min(1).parse(id), z.number().int().min(0).max(cms.MAX_REVISIONS).parse(index));
    return null;
  }, "Version restored");
}

/** Upload a CMS image (PNG/JPG ≤ 5 MB). Alt text is required. */
export async function uploadImageAction(form: FormData) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    const { ip } = await requestMeta();
    await enforceRateLimit("upload", `${user.id}:${ip ?? ""}`);
    const file = await fileToBuffer(form.get("file") as File | null);
    if (!file) throw new cms.CmsError("Choose an image to upload.", "file");
    return cms.uploadImage(user, file, String(form.get("alt") ?? ""));
  });
}

/** Server-rendered preview of unsaved content (same sanitiser as save). */
export async function previewAction(body: unknown) {
  return safeAction(async () => {
    await requireRole(["ADMIN"]);
    const { html, issues } = cms.renderRichText(body, { requireAlt: false });
    return { html, missingAlt: issues.some((i) => i.code === "image_alt_missing") };
  });
}
