"use server";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { answerSkillCheck, SKILL_LEVELS } from "@/server/services/skill-check";

const schema = z.array(z.object({ skill: z.string().trim().min(1).max(60), level: z.enum(SKILL_LEVELS) })).min(1).max(60);

/** The student answers their own skill check (D-164). */
export async function answerSkillCheckAction(answers: { skill: string; level: "have" | "basic" | "no" }[]) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    return answerSkillCheck(user, schema.parse(answers));
  }, "Thanks — your profile is updated. New resumes will use these skills.");
}
