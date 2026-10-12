import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireStudent } from "@/server/auth/guards";
import { getStudentProfile } from "@/server/services/student-profile";
import { listOwnCredentials } from "@/server/services/vault";
import { getLatestParse } from "@/server/services/resumes";
import { getSubscriptionState } from "@/server/services/applications";
import { getLatestUpload } from "@/server/services/student-profile";
import { STEP_COUNT } from "@/server/services/onboarding";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Set up your account", robots: { index: false } };
export const dynamic = "force-dynamic";

/** F3: focused, resumable onboarding wizard (outside the portal shell). */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, student } = await requireStudent();
  if (student.onboardingCompletedAt) redirect("/app");
  const t = await getTranslations("student.onboarding");
  const [profile, credentials, parse, sub, upload] = await Promise.all([getStudentProfile(user), listOwnCredentials(user), getLatestParse(student.id), getSubscriptionState(student.id), getLatestUpload(student.id)]);

  const requested = Number(sp.step);
  const maxStep = Math.min(profile.onboardingStep, STEP_COUNT - 1);
  const initialStep = Number.isInteger(requested) && requested >= 1 && requested - 1 <= maxStep ? requested - 1 : maxStep;

  return (
    <OnboardingWizard
      title={t("title")}
      paid={sp.paid === "1"}
      subscriptionActive={sub.active}
      initialStep={initialStep}
      maxStep={maxStep}
      firstName={profile.personal.name.split(/\s+/)[0] ?? profile.personal.name}
      email={profile.personal.email}
      emailVerified={profile.personal.emailVerified}
      marketCode={profile.market.code}
      master={profile.master}
      blankMaster={profile.blankMaster}
      parse={parse ? { method: parse.method, warnings: parse.warnings } : null}
      uploadName={upload?.filename ?? null}
      preferences={profile.preferences}
      links={profile.links}
      credentials={credentials.map((c) => ({ id: c.id, kind: c.kind, label: c.label, loginUrl: c.loginUrl, hasNotes: c.hasNotes, updatedAt: c.updatedAt.toISOString() }))}
    />
  );
}
