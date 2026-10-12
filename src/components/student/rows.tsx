import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, CalendarPlus, Download, ExternalLink, FileText, MapPin, Video } from "lucide-react";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { CompanyLogo } from "@/components/portal/company-logo";
import { StatusPill } from "@/components/portal/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";

export type AppRow = {
  id: string;
  companyName: string;
  companyDomain: string | null;
  jobTitle: string;
  location: string | null;
  jobUrl: string;
  status: ApplicationStatus;
  appliedAt: Date | null;
  resumeVersionId: string | null;
};

/** "Applied 9:42 PM your time" (today) or "Applied 3 Oct, 9:42 PM" — in the student's zone. */
export async function appliedLabel(at: Date | null, tz: string, now = new Date()) {
  const t = await getTranslations("student.rows");
  if (!at) return t("notApplied");
  const sameDay = formatInTz(at, tz, "yyyy-MM-dd") === formatInTz(now, tz, "yyyy-MM-dd");
  return sameDay ? t("appliedToday", { time: formatInTz(at, tz, "h:mm a") }) : t("appliedOn", { date: formatInTz(at, tz, "d MMM, h:mm a") });
}

/** One application in a list (design: lettermark, title, company · time, pill, Resume link). */
export async function ApplicationListItem({ a, tz }: { a: AppRow; tz: string }) {
  const t = await getTranslations("student.rows");
  const when = await appliedLabel(a.appliedAt, tz);
  return (
    <li className="relative flex items-center gap-3 border-t border-border py-3 first:border-t-0">
      <CompanyLogo name={a.companyName} domain={a.companyDomain} size={40} />
      <div className="min-w-0 flex-1">
        <Link href={`/app/applications/${a.id}`} className="block truncate font-semibold after:absolute after:inset-0 hover:text-primary">
          {a.jobTitle}
        </Link>
        <p className="truncate text-[13px] text-muted-foreground">
          {a.companyName}
          {a.location ? <span className="hidden sm:inline"> · {a.location}</span> : null}
        </p>
        <p className="truncate text-[12.5px] text-subtle-foreground">
          <time dateTime={a.appliedAt?.toISOString()}>{when}</time>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <StatusPill status={a.status} />
        <span className="relative z-10 flex items-center gap-1">
          {a.resumeVersionId ? (
            <a href={`/api/resumes/${a.resumeVersionId}/pdf?inline=1`} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1 rounded-[8px] px-1.5 text-[13px] font-semibold text-primary hover:underline" aria-label={t("resumeFor", { title: a.jobTitle, company: a.companyName })}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {t("resume")}
            </a>
          ) : null}
          <a href={a.jobUrl} target="_blank" rel="noopener noreferrer nofollow" className="hidden min-h-9 items-center rounded-[8px] px-1.5 text-muted-foreground hover:text-foreground sm:inline-flex" aria-label={t("jobLinkFor", { title: a.jobTitle, company: a.companyName })}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </span>
      </div>
    </li>
  );
}

export type InterviewRowData = {
  id: string;
  scheduledAt: Date;
  timezone: string;
  round: string;
  mode: string;
  meetingLink: string | null;
  interviewers?: string | null;
  application: { id: string; companyName: string; companyDomain: string | null; jobTitle: string };
};

export async function InterviewItem({ i, tz, showPrep = true, stacked = false }: { i: InterviewRowData; tz: string; showPrep?: boolean; stacked?: boolean }) {
  const t = await getTranslations("student.rows");
  const Icon = i.mode === "Onsite" ? MapPin : Video;
  return (
    <li className={cn("flex min-w-0 flex-col gap-3 rounded-[14px] border border-border bg-surface p-3.5", !stacked && "sm:flex-row sm:items-center")}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-[12px] bg-[#E6F4EC] py-1.5 text-success">
          <span className="text-[11px] font-bold uppercase tracking-wide">{formatInTz(i.scheduledAt, tz, "MMM")}</span>
          <span className="text-xl font-bold leading-none tabular">{formatInTz(i.scheduledAt, tz, "d")}</span>
        </div>
        <div className="min-w-0">
          <Link href={`/app/applications/${i.application.id}`} className="block truncate font-semibold hover:text-primary">
            {i.application.jobTitle} · {i.application.companyName}
          </Link>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            <span>{formatInTz(i.scheduledAt, tz, "EEE, h:mm a")} {t("yourTime")}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t(`mode.${i.mode as "Video"}`)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t(`round.${i.round.replace(/\s+/g, "_") as "Technical"}`)}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {i.meetingLink ? (
          <a href={i.meetingLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "secondary" })}>
            {t("join")}
          </a>
        ) : null}
        <a href={`/api/student/interviews/${i.id}/ics`} className={buttonVariants({ size: "sm", variant: "outline" })} aria-label={t("addToCalendarFor", { company: i.application.companyName })}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          {t("addToCalendar")}
        </a>
        {showPrep ? (
          <Link href="/app/prep" className={buttonVariants({ size: "sm", variant: "ghost" })}>
            {t("prep")}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** Read-only banner for inactive subscriptions (SPEC §5). */
export async function RenewBanner({ className }: { className?: string }) {
  const t = await getTranslations("student.common");
  return (
    <div role="status" className={cn("mb-6 flex flex-col gap-3 rounded-[16px] border border-[#F0D9AE] bg-[#FDF3E1] p-4 text-[#5E3C08] sm:flex-row sm:items-center", className)}>
      <AlertTriangle className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden="true" />
      <div className="flex-1 text-sm">
        <p className="font-semibold">{t("renewBannerTitle")}</p>
        <p>{t("renewBannerBody")}</p>
      </div>
      <Link href="/app/billing" className={buttonVariants({ className: "self-start sm:self-auto" })}>
        {t("renew")}
      </Link>
    </div>
  );
}

export function DownloadLinks({ versionId, label }: { versionId: string; label: string }) {
  return (
    <span className="inline-flex gap-1.5">
      <a href={`/api/resumes/${versionId}/pdf`} className={buttonVariants({ size: "sm", variant: "outline" })} aria-label={`${label} PDF`}>
        <Download className="h-4 w-4" aria-hidden="true" />
        PDF
      </a>
      <a href={`/api/resumes/${versionId}/docx`} className={buttonVariants({ size: "sm", variant: "outline" })} aria-label={`${label} DOCX`}>
        <Download className="h-4 w-4" aria-hidden="true" />
        DOCX
      </a>
    </span>
  );
}
