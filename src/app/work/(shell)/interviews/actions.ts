"use server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireStaff } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { addInterview, updateInterview, updateStatus, type InterviewInputT } from "@/server/services/applications";
import { db } from "@/server/db";

/**
 * Add an interview to an application. If the application isn't yet at an
 * interview stage, the status moves to INTERVIEW_SCHEDULED with this interview
 * (F5); otherwise it's another round.
 */
export async function addInterviewAction(applicationId: string, input: InterviewInputT) {
  const t = await getTranslations("work.interviews.toasts");
  return safeAction(async () => {
    const { user } = await requireStaff();
    const id = z.string().min(1).max(64).parse(applicationId);
    const app = await db.jobApplication.findUnique({ where: { id }, select: { status: true } });
    if (app && !["INTERVIEW_SCHEDULED", "INTERVIEWING"].includes(app.status)) {
      await updateStatus(user, { applicationId: id, to: "INTERVIEW_SCHEDULED", interview: input });
    } else {
      await addInterview(user, id, input);
    }
    return null;
  }, t("added"));
}

export async function updateInterviewAction(interviewId: string, input: InterviewInputT & { outcome?: string | null }) {
  const t = await getTranslations("work.interviews.toasts");
  return safeAction(async () => {
    const { user } = await requireStaff();
    await updateInterview(user, z.string().min(1).max(64).parse(interviewId), input);
    return null;
  }, t("updated"));
}
