"use server";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { fileToBuffer } from "@/server/services/files";
import * as apps from "@/server/services/applications";
import * as resumes from "@/server/services/resumes";
import type { ApplicationStatus } from "@/generated/prisma/enums";

const STAFF = ["EMPLOYEE", "MANAGER", "ADMIN"] as const;
const id = z.string().min(1).max(64);

export async function checkDuplicatesAction(input: { studentId: string; jobUrl?: string; companyName?: string; jobTitle?: string }) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    const data = z.object({ studentId: id, jobUrl: z.string().max(2000).optional(), companyName: z.string().max(200).optional(), jobTitle: z.string().max(200).optional() }).parse(input);
    return apps.checkDuplicates(user, data);
  });
}

export async function saveVersionAction(versionId: string, content: unknown, jobTitle?: string) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    const r = await resumes.updateVersionContent(user, id.parse(versionId), content, z.string().max(200).optional().parse(jobTitle));
    return { validation: r.validation, tailored: r.tailored, pages: r.pages };
  });
}

const CoverInput = z.object({ versionId: id, jd: z.string().max(20_000), company: z.string().max(200), title: z.string().max(200), location: z.string().max(200).nullish() });

export async function generateCoverLetterAction(input: z.input<typeof CoverInput>) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    return resumes.generateCoverLetter(user, CoverInput.parse(input));
  });
}

export async function saveCoverLetterAction(versionId: string, text: string) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    return resumes.updateCoverLetter(user, id.parse(versionId), z.string().max(4000).parse(text));
  });
}

/** FormData: job fields + resumeVersionId + jdText + coverLetter + proofText + proof (file) + confirmSimilar. */
export async function markAppliedAction(form: FormData) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    const get = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v !== "" ? v : undefined;
    };
    const proof = await fileToBuffer(form.get("proof") as File | null);
    return apps.markApplied(
      user,
      {
        studentId: get("studentId") ?? "",
        jobUrl: get("jobUrl") ?? "",
        companyName: get("companyName") ?? "",
        jobTitle: get("jobTitle") ?? "",
        location: get("location"),
        workMode: get("workMode") as apps.JobFieldsInput["workMode"],
        employmentType: get("employmentType") as apps.JobFieldsInput["employmentType"],
        source: (get("source") ?? "OTHER") as apps.JobFieldsInput["source"],
        resumeVersionId: get("resumeVersionId") ?? "",
        jdText: get("jdText"),
        coverLetter: get("coverLetter"),
        proofText: get("proofText"),
        confirmSimilar: get("confirmSimilar") === "1",
      },
      proof,
    );
  }, "Application logged");
}

export async function quickLogAction(form: FormData) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    const get = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v !== "" ? v : undefined;
    };
    const proof = await fileToBuffer(form.get("proof") as File | null);
    return apps.quickLog(
      user,
      {
        studentId: get("studentId") ?? "",
        jobUrl: get("jobUrl") ?? "",
        companyName: get("companyName") ?? "",
        jobTitle: get("jobTitle") ?? "",
        location: get("location"),
        workMode: get("workMode") as apps.JobFieldsInput["workMode"],
        employmentType: get("employmentType") as apps.JobFieldsInput["employmentType"],
        source: (get("source") ?? "OTHER") as apps.JobFieldsInput["source"],
        resumeVersionId: get("resumeVersionId") ?? "base",
        proofText: get("proofText"),
        confirmSimilar: get("confirmSimilar") === "1",
      },
      proof,
    );
  }, "Application logged");
}

export async function listVersionsAction(studentId: string) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    const rows = await apps.listReusableVersions(user, id.parse(studentId));
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), lockedAt: r.lockedAt?.toISOString() ?? null }));
  });
}

export async function updateStatusAction(input: { applicationId: string; to: ApplicationStatus; note?: string }) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    return apps.updateStatus(user, input);
  }, "Status updated");
}
