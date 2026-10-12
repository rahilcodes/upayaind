import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { StatusPill } from "@/components/portal/status-pill";
import { CompanyLogo } from "@/components/portal/company-logo";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { tzLabel } from "@/components/work/tz";
import { requireStaff } from "@/server/auth/guards";
import { listMyInterviews } from "@/server/services/work-dashboard";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InterviewDialog } from "./interview-dialog";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.interviews");
  return { title: t("metaTitle") };
}

/** /work/interviews — my students' interviews (upcoming / past), add + edit. */
export default async function WorkInterviewsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireStaff();
  const sp = await searchParams;
  const when = sp.when === "past" ? "past" : "upcoming";
  const t = await getTranslations("work.interviews");
  const tc = await getTranslations("work.common");
  const data = await listMyInterviews(user, when);
  if (!data) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState className="bg-surface" title={tc("noProfileTitle")} body={tc("noProfileBody")} />
      </>
    );
  }
  const tz = data.timezone;
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<InterviewDialog apps={data.apps} defaultTz="America/New_York" defaultAppId={sp.application} />}
      />
      <nav aria-label={t("viewNav")} className="mb-5 inline-flex rounded-[12px] bg-surface-muted p-1">
        {(["upcoming", "past"] as const).map((k) => (
          <Link key={k} href={k === "past" ? "/work/interviews?when=past" : "/work/interviews"} aria-current={when === k ? "page" : undefined} className={cn("rounded-[10px] px-4 py-2 text-sm font-semibold", when === k ? "bg-surface shadow-sm" : "text-muted-foreground")}>
            {t(k)}
          </Link>
        ))}
      </nav>
      {data.rows.length === 0 ? (
        <EmptyState className="bg-surface" icon={<CalendarClock className="h-6 w-6" aria-hidden="true" />} title={when === "upcoming" ? t("emptyUpcoming") : t("emptyPast")} body={when === "upcoming" ? t("emptyUpcomingBody") : undefined} />
      ) : (
        <ul className="grid gap-3">
          {data.rows.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-4 rounded-[16px] border border-border bg-surface p-4">
              <div className="w-[56px] shrink-0 rounded-[12px] bg-[#E9F5EE] py-2 text-center text-success dark:bg-success/20 dark:text-[#7BD3A5]">
                <div className="text-[11px] font-bold uppercase">{formatInTz(i.scheduledAt, tz, "EEE")}</div>
                <div className="text-xl font-bold leading-tight">{formatInTz(i.scheduledAt, tz, "d")}</div>
                <div className="text-[11px] font-semibold">{formatInTz(i.scheduledAt, tz, "MMM")}</div>
              </div>
              <div className="min-w-0 flex-[1_1_260px]">
                <div className="flex flex-wrap items-center gap-2">
                  <CompanyLogo name={i.application.companyName} domain={i.application.companyDomain} size={24} />
                  <p className="font-semibold">{i.application.companyName} — {i.application.jobTitle}</p>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  <Link href={`/work/students/${i.application.studentId}`} className="font-medium text-foreground hover:underline">{i.application.student.user.name}</Link>
                  {" · "}{i.round} · {i.mode}
                </p>
                <p className="mt-0.5 text-sm tabular">
                  {formatInTz(i.scheduledAt, tz, "h:mm a")} {tzLabel(tz, i.scheduledAt)}
                  <span className="text-muted-foreground"> · {t("theirTime", { time: formatInTz(i.scheduledAt, i.timezone, "h:mm a"), tz: tzLabel(i.timezone, i.scheduledAt) })}</span>
                </p>
                {i.interviewers ? <p className="mt-0.5 text-xs text-muted-foreground">{t("with", { names: i.interviewers })}</p> : null}
                {i.outcome ? <p className="mt-1 text-sm"><span className="font-semibold">{t("outcome")}:</span> {i.outcome}</p> : null}
              </div>
              <StatusPill status={i.application.status} />
              <div className="flex gap-2">
                {i.meetingLink ? (
                  <a href={i.meetingLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>
                    {t("join")}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                ) : null}
                <InterviewDialog defaultTz={i.timezone} interview={{ id: i.id, scheduledAt: i.scheduledAt.toISOString(), timezone: i.timezone, round: i.round, mode: i.mode, meetingLink: i.meetingLink, interviewers: i.interviewers, prepNotes: i.prepNotes, outcome: i.outcome }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
