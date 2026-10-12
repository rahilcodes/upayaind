import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarDays, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InterviewItem } from "@/components/student/rows";
import { requireStudent } from "@/server/auth/guards";
import { listStudentInterviews } from "@/server/services/student-applications";
import { formatInTz } from "@/lib/format";

export const metadata: Metadata = { title: "Interviews" };
export const dynamic = "force-dynamic";

export default async function InterviewsPage() {
  const { user } = await requireStudent();
  const t = await getTranslations("student.interviews");
  const { upcoming, past, timezone: tz } = await listStudentInterviews(user);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link href="/app/prep" className={buttonVariants({ variant: "outline" })}>
            <GraduationCap className="h-4 w-4" aria-hidden="true" />
            {t("prep")}
          </Link>
        }
      />
      <section aria-labelledby="up-h" className="mb-8">
        <h2 id="up-h" className="mb-3 text-[17px] font-bold">
          {t("upcoming")} <span className="text-muted-foreground tabular">({upcoming.length})</span>
        </h2>
        {upcoming.length ? (
          <ul className="grid grid-cols-1 gap-3">
            {upcoming.map((i) => (
              <InterviewItem key={i.id} i={i} tz={tz} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />} title={t("emptyTitle")} body={t("emptyBody")} className="bg-surface" />
        )}
      </section>
      {past.length ? (
        <section aria-labelledby="past-h">
          <h2 id="past-h" className="mb-3 text-[17px] font-bold">
            {t("past")} <span className="text-muted-foreground tabular">({past.length})</span>
          </h2>
          <ul className="grid grid-cols-1 gap-2">
            {past.map((i) => (
              <li key={i.id} className="flex min-w-0 items-center gap-3 rounded-[14px] border border-border bg-surface px-4 py-3 text-sm">
                <span className="w-20 shrink-0 text-muted-foreground tabular">{formatInTz(i.scheduledAt, tz, "d MMM yy")}</span>
                <Link href={`/app/applications/${i.application.id}`} className="min-w-0 flex-1 truncate font-semibold hover:text-primary">
                  {i.application.jobTitle} · {i.application.companyName}
                </Link>
                <span className="hidden shrink-0 text-muted-foreground sm:inline">{i.round}</span>
                {i.outcome ? <span className="hidden max-w-[30%] truncate text-muted-foreground md:inline">{i.outcome}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
