import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { UserError } from "@/server/errors";
import { CONSENT_VERSION } from "@/lib/schemas/auth";
import { ONBOARDING_STEPS, type OnboardingStepKey } from "@/lib/schemas/student";
import { parseMaster } from "./resumes";
import { audit } from "./audit";
import { notify } from "./notify";
import { trackEvent } from "./events";
import { log } from "@/server/log";

/**
 * Onboarding wizard state (SPEC F3). `StudentProfile.onboardingStep` = number
 * of steps completed (0…5); the wizard resumes at that step. Steps:
 * 0 resume → 1 preferences → 2 vault → 3 links → 4 review & consent.
 * Completion requires a valid master profile, job preferences, a verified
 * email and the "apply on my behalf" consent; it stamps onboardingCompletedAt
 * and the consent (timestamp + version) and notifies the assigned employee.
 */

type Actor = { id: string; role: Role };

export const STEP_COUNT = ONBOARDING_STEPS.length; // 5
export const stepIndex = (k: OnboardingStepKey) => ONBOARDING_STEPS.indexOf(k);

export class OnboardingError extends UserError {
  constructor(
    message: string,
    public code: "email_unverified" | "no_master" | "no_preferences" | "no_consent" | "already_done",
    field?: string,
  ) {
    super(message, field);
  }
}

async function profileFor(user: Actor) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, onboardingStep: true, onboardingCompletedAt: true, masterProfile: true, targetTitles: true, workModes: true, workAuthorization: true, user: { select: { name: true, emailVerified: true } } },
  });
  if (!s) throw new ForbiddenError();
  return s;
}

/** Mark a step finished; never moves backwards. Returns the new step count. */
export async function completeStep(user: Actor, step: OnboardingStepKey) {
  const s = await profileFor(user);
  const next = Math.min(STEP_COUNT - 1, stepIndex(step) + 1);
  if (s.onboardingCompletedAt) return s.onboardingStep;
  if (next > s.onboardingStep) {
    // Conditional update: concurrent saves can only raise the counter.
    await db.studentProfile.updateMany({ where: { id: s.id, onboardingStep: { lt: next } }, data: { onboardingStep: next } });
    return next;
  }
  return s.onboardingStep;
}

export type CompletionCheck = { emailVerified: boolean; hasMaster: boolean; hasPreferences: boolean };

export async function completionCheck(user: Actor): Promise<CompletionCheck> {
  const s = await profileFor(user);
  return {
    emailVerified: Boolean(s.user.emailVerified),
    hasMaster: Boolean(parseMaster(s.masterProfile).master),
    hasPreferences: s.targetTitles.length > 0 && s.workModes.length > 0 && Boolean(s.workAuthorization),
  };
}

/**
 * Finish onboarding (F3 "Review & consent"). Idempotent: a second call
 * returns the existing completion. The caller must refresh the session
 * (`unstable_update`) so middleware lets the student into /app.
 */
export async function completeOnboarding(user: Actor, input: { consent: boolean }) {
  const s = await profileFor(user);
  if (s.onboardingCompletedAt) return { completedAt: s.onboardingCompletedAt, notified: false };
  if (!s.user.emailVerified) throw new OnboardingError("Please confirm your email address first. We've sent you a link — you can resend it below.", "email_unverified");
  if (!parseMaster(s.masterProfile).master) throw new OnboardingError("Your master profile isn't complete yet. Go back to step 1 to upload or fill in your resume.", "no_master");
  if (!(s.targetTitles.length > 0 && s.workModes.length > 0 && s.workAuthorization)) throw new OnboardingError("Add your job preferences (step 2) before finishing.", "no_preferences");
  if (!input.consent) throw new OnboardingError("Please confirm that we may apply to jobs on your behalf.", "no_consent", "consent");

  const now = new Date();
  const r = await db.studentProfile.updateMany({
    where: { id: s.id, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: now, onboardingStep: STEP_COUNT, consentApplyOnBehalfAt: now, consentVersion: CONSENT_VERSION },
  });
  if (r.count === 0) {
    const again = await profileFor(user);
    return { completedAt: again.onboardingCompletedAt ?? now, notified: false };
  }
  await audit({ actorId: user.id, action: "student.onboarding_completed", entity: "StudentProfile", entityId: s.id, after: { consentVersion: CONSENT_VERSION, consentAt: now.toISOString() } });
  await trackEvent("onboarding_completed", user.id);

  // Notify the assigned employee (primary first; a cover employee during leave too).
  const assignments = await db.assignment.findMany({
    where: { studentId: s.id, isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    select: { employee: { select: { userId: true } } },
  });
  const recipients = [...new Set(assignments.map((a) => a.employee.userId))];
  for (const uid of recipients) {
    await notify(uid, "onboarding_completed", { studentName: s.user.name, studentId: s.id }).catch((e) => log.error("onboarding.notify_failed", { err: e }));
  }
  return { completedAt: now, notified: recipients.length > 0 };
}
