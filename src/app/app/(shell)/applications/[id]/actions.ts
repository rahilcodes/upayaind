"use server";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { reportOutcome } from "@/server/services/applications";

const Input = z.object({
  applicationId: z.string().min(1).max(40),
  kind: z.enum(["interview", "offer"]),
  note: z.string().trim().max(2000).optional().nullable(),
  interview: z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the interview date."),
      time: z.string().regex(/^\d{2}:\d{2}$/, "Pick the interview time."),
      timezone: z.string().min(1).max(64),
      round: z.string(),
      mode: z.string(),
      meetingLink: z.string().optional().nullable(),
      interviewers: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

/** "I got an interview / offer" (SPEC F5 student self-report). */
export async function reportOutcomeAction(raw: z.input<typeof Input>) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    const input = Input.parse(raw);
    let interview = null;
    if (input.kind === "interview" && input.interview) {
      const { TZDate } = await import("@date-fns/tz");
      const [y, m, d] = input.interview.date.split("-").map(Number);
      const [hh, mm] = input.interview.time.split(":").map(Number);
      const scheduledAt = new Date(new TZDate(y!, m! - 1, d!, hh!, mm!, 0, input.interview.timezone).getTime());
      interview = { scheduledAt, timezone: input.interview.timezone, round: input.interview.round, mode: input.interview.mode, meetingLink: input.interview.meetingLink || null, interviewers: input.interview.interviewers || null } as never;
    }
    return reportOutcome(user, { applicationId: input.applicationId, kind: input.kind, note: input.note, interview });
  }, "Thanks! Your specialist has been notified.");
}
