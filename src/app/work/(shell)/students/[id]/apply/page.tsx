import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { requireStaff } from "@/server/auth/guards";
import { ForbiddenError } from "@/server/auth/access";
import { getWorkspaceData } from "@/server/services/applications";
import { getStudentResumeContext } from "@/server/services/resumes";
import { allProfileSkills } from "@/resume/schema";
import { aiConfigured } from "@/server/ai/client";
import { getWorkspaceDefaults, listCompanySuggestions } from "@/server/services/workspace-prefs";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ApplyWorkspace } from "./workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("workspace");
  return { title: t("metaTitle") };
}

/** F4: the application workspace (JD → tailored resume → log). */
export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireStaff();
  const t = await getTranslations("workspace");

  let data: Awaited<ReturnType<typeof getWorkspaceData>>;
  try {
    data = await getWorkspaceData(user, id);
  } catch (e) {
    if (e instanceof ForbiddenError || (e instanceof Error && e.name === "ApplicationError")) {
      return (
        <EmptyState
          className="mx-auto mt-10 max-w-xl bg-surface"
          icon={<ShieldAlert className="h-6 w-6" aria-hidden="true" />}
          title={t("noAccessTitle")}
          body={t("noAccessBody")}
          action={
            <Link href="/work/students" className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("backToStudents")}
            </Link>
          }
        />
      );
    }
    throw e;
  }
  const [ctx, defaults, companies] = await Promise.all([getStudentResumeContext(id), getWorkspaceDefaults(user.id), listCompanySuggestions(user)]);

  return (
    <ApplyWorkspace
      student={{ ...data.student, firstName: data.student.name.split(/\s+/)[0] ?? data.student.name }}
      market={data.market}
      style={{ ...ctx.style, styleName: ctx.style.name }}
      subscription={{ active: data.subscription.active, status: data.subscription.status, planName: data.subscription.planName, dailyTarget: data.subscription.dailyTarget }}
      today={data.today}
      companies={companies}
      defaults={defaults}
      recent={data.recent.map((r) => ({ id: r.id, companyName: r.companyName, jobTitle: r.jobTitle, status: r.status, appliedAt: (r.appliedAt ?? r.createdAt).toISOString(), resumeVersionId: r.resumeVersionId }))}
      master={ctx.master}
      masterIssues={ctx.masterIssues}
      profileSkills={ctx.master ? allProfileSkills(ctx.master) : []}
      aiEnabled={aiConfigured()}
      employeeTimezone={data.employeeTimezone}
    />
  );
}
