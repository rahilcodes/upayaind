import "server-only";
import { db } from "@/server/db";
import { parseUploadedResume, purgeJdCache, saveParsedMasterProfile, ensureRendered } from "@/server/services/resumes";
import { defineJob } from "./client";

/**
 * Resume jobs (SPEC §9.1, F3 step 1).
 * - "resume.parse" {studentId, fileId}: extract text → Claude (or heuristic
 *   fallback) → save StudentProfile.masterProfile + MASTER_UPLOAD version.
 * - "resume.render" {versionId, format}: pre-render PDF/DOCX into storage.
 * - nightly purge of expired JD analysis cache entries (30 days).
 */

export const resumeParseJob = defineJob<{ studentId: string; fileId: string }>({
  id: "resume-parse",
  event: "resume.parse",
  concurrencyKey: "studentId",
  retries: 2,
  run: async ({ studentId, fileId }) => {
    const file = await db.fileObject.findUnique({ where: { id: fileId }, select: { key: true, mime: true, studentId: true, ownerUserId: true } });
    if (!file || file.studentId !== studentId) throw new Error(`resume.parse: file ${fileId} doesn't belong to student ${studentId}`);
    const result = await parseUploadedResume(studentId, { fileKey: file.key }, file.mime, { actorUserId: file.ownerUserId });
    const v = await saveParsedMasterProfile({ studentId, result, originalFileKey: file.key, createdById: file.ownerUserId });
    return { versionId: v.id, method: result.method, warnings: result.warnings.length };
  },
});

export const resumeRenderJob = defineJob<{ versionId: string; format?: "pdf" | "docx" }>({
  id: "resume-render",
  event: "resume.render",
  retries: 2,
  run: async ({ versionId, format }) => {
    const formats = format ? [format] : (["pdf", "docx"] as const);
    for (const f of formats) await ensureRendered(versionId, f);
    return { versionId };
  },
});

export const jdCachePurgeJob = defineJob({
  id: "jd-cache-purge",
  cron: "15 3 * * *",
  run: async () => ({ deleted: await purgeJdCache() }),
});
