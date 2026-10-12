import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Briefcase, Building2, CircleDot, ExternalLink, Image as ImageIcon, MapPin } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { CompanyLogo } from "@/components/portal/company-logo";
import { StatusPill } from "@/components/portal/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DownloadLinks, InterviewItem } from "@/components/student/rows";
import { ReportOutcome } from "@/components/student/report-outcome";
import { ResumePreview } from "@/components/student/resume-preview";
import { requireStudent } from "@/server/auth/guards";
import { canTransition } from "@/server/services/applications";
import { getStudentApplication } from "@/server/services/student-applications";
import { formatInTz } from "@/lib/format";

export const metadata: Metadata = { title: "Application" };
export const dynamic = "force-dynamic";

export default async function ApplicationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, student } = await requireStudent();
  const a = await getStudentApplication(user, id);
  if (!a) notFound();
  const t = await getTranslations("student.detail");
  const tsrc = await getTranslations("jobSource");
  const tm = await getTranslations("workMode");
  const te = await getTranslations("employmentType");
  const ts = await getTranslations("status");
  const tz = a.timezone;
  const upcoming = a.interviews.filter((i) => i.scheduledAt.getTime() > Date.now() - 3600e3);
  const canInterview = canTransition(a.status, "INTERVIEW_SCHEDULED") || a.status === "INTERVIEW_SCHEDULED";
  const canOffer = canTransition(a.status, "OFFER");

  return (
    <>
      <Link href="/app/applications" className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <div className="mb-6 flex flex-col gap-4 rounded-[20px] border border-border bg-surface p-4 sm:flex-row sm:items-center sm:p-6">
        <CompanyLogo name={a.companyName} domain={a.companyDomain} size={56} />
        <div className="min-w-0 flex-1">
          <PageHeader title={a.jobTitle} />
          <div className="-mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              {a.companyName}
            </span>
            {a.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-4 w-4" aria-hidden="true" />
                {a.location}
              </span>
            ) : null}
            {a.workMode || a.employmentType ? (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-4 w-4" aria-hidden="true" />
                {[a.workMode && tm(a.workMode), a.employmentType && te(a.employmentType)].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <StatusPill status={a.status} />
            <span className="text-muted-foreground">
              {a.appliedAt ? t("appliedBy", { date: formatInTz(a.appliedAt, tz, "d MMM yyyy, h:mm a"), name: a.specialistFirstName }) : null} · {tsrc(a.source)}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <a href={a.jobUrl} target="_blank" rel="noopener noreferrer nofollow" className={buttonVariants({ variant: "outline" })}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t("openPosting")}
          </a>
        </div>
      </div>

      {/* Reporting stays available even when the plan is inactive: it's the student's own news. */}
      <div className="mb-6 flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">{canInterview || canOffer ? t("reportPrompt") : t("reportClosed", { status: ts(a.status) })}</p>
        <ReportOutcome applicationId={a.id} timezone={user.timezone} canInterview={canInterview} canOffer={canOffer} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
        <div className="grid grid-cols-1 content-start gap-6">
          {a.interviews.length ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("interviews")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid grid-cols-1 gap-3">
                  {[...upcoming, ...a.interviews.filter((i) => !upcoming.includes(i)).reverse()].map((i) => (
                    <InterviewItem key={i.id} i={{ ...i, application: { id: a.id, companyName: a.companyName, companyDomain: a.companyDomain, jobTitle: a.jobTitle } }} tz={tz} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t("timeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative grid gap-5 border-l-2 border-border pl-5">
                {a.appliedAt && !a.timeline.some((e) => e.toStatus === "APPLIED") ? (
                  <li className="relative">
                    <CircleDot className="absolute -left-[31px] top-0.5 h-5 w-5 rounded-full bg-surface text-blue" aria-hidden="true" />
                    <p className="font-semibold">{ts("APPLIED")}</p>
                    <p className="text-[13px] text-muted-foreground">{formatInTz(a.appliedAt, tz, "d MMM yyyy, h:mm a")}</p>
                  </li>
                ) : null}
                {a.timeline.map((e) => (
                  <li key={e.id} className="relative">
                    <CircleDot className="absolute -left-[31px] top-0.5 h-5 w-5 rounded-full bg-surface text-blue" aria-hidden="true" />
                    <p className="font-semibold">{ts(e.toStatus)}</p>
                    <p className="text-[13px] text-muted-foreground">
                      {formatInTz(e.at, tz, "d MMM yyyy, h:mm a")}
                      {e.by ? ` · ${e.by}` : ""}
                    </p>
                    {e.note ? <p className="mt-1 whitespace-pre-wrap text-sm">{e.note}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {a.coverLetter ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("coverLetter")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{a.coverLetter}</p>
              </CardContent>
            </Card>
          ) : null}

          {a.proofFile || a.proofText ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("proof")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {a.proofFile ? (
                  <a href={`/api/files/${a.proofFile.id}?inline=1`} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline", className: "justify-self-start" })}>
                    <ImageIcon className="h-4 w-4" aria-hidden="true" />
                    {t("viewScreenshot")}
                  </a>
                ) : null}
                {a.proofText ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[12px] bg-surface-muted p-3 font-sans text-sm">{a.proofText}</pre> : null}
              </CardContent>
            </Card>
          ) : null}

          {a.jdText ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("jd")}</CardTitle>
              </CardHeader>
              <CardContent>
                <details className="group">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">{t("showJd")}</span>
                    <span className="hidden group-open:inline">{t("hideJd")}</span>
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{a.jdText}</p>
                </details>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="self-start">
          <CardHeader>
            <div>
              <CardTitle>{t("resumeUsed")}</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">{a.resumeVersion?.kind === "TAILORED" ? t("tailoredNote") : t("baseNote")}</p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {a.resumeVersion ? (
              <>
                <DownloadLinks versionId={a.resumeVersion.id} label={t("resumeUsed")} />
                <ResumePreview studentId={student.id} versionId={a.resumeVersion.id} title={a.resumeVersion.title} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noResume")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
