"use server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { signOut } from "@/server/auth";
import { requireAction } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { bumpSessionVersion } from "@/server/services/accounts";
import { cancelSession, coachContext, publishSlots, recordSessionOutcome, scheduleSession, type CoachScorecardInput, type CoachSlotInput, type ScheduleSessionInput } from "@/server/services/coach";

/** Coach portal server actions — every one gated by rbac "coach.sessions" (COACH, ADMIN). */

export async function publishSlotsAction(input: CoachSlotInput) {
  const t = await getTranslations("coach.sessions.publish");
  return safeAction(async () => {
    const ctx = await coachContext(await requireAction("coach.sessions"));
    return publishSlots(ctx, input);
  }, t("toast"));
}

export async function scheduleSessionAction(input: ScheduleSessionInput) {
  const t = await getTranslations("coach.sessions.schedule");
  return safeAction(async () => {
    const ctx = await coachContext(await requireAction("coach.sessions"));
    return scheduleSession(ctx, input);
  }, t("toast"));
}

export async function cancelSessionAction(id: string, reason: string) {
  const t = await getTranslations("coach.sessions.cancel");
  return safeAction(async () => {
    const ctx = await coachContext(await requireAction("coach.sessions"));
    return cancelSession(ctx, { id: z.string().min(1).parse(id), reason });
  }, t("toast"));
}

export async function recordOutcomeAction(input: CoachScorecardInput) {
  const t = await getTranslations("coach.sessions.outcome");
  return safeAction(async () => {
    const ctx = await coachContext(await requireAction("coach.sessions"));
    return recordSessionOutcome(ctx, input);
  }, t("toast"));
}

/** "Log out of all devices" (D-124). */
export async function logoutEverywhereAction() {
  const user = await requireAction("coach.sessions");
  await bumpSessionVersion(user.id);
  await signOut({ redirect: false });
  redirect("/login?team=1");
}
