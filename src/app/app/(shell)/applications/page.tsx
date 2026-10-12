import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, ExternalLink, FileText, Inbox, Search, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { CompanyLogo } from "@/components/portal/company-logo";
import { StatusPill } from "@/components/portal/status-pill";
import { Pagination, withParams } from "@/components/portal/pagination";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/input";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { RenewBanner, appliedLabel } from "@/components/student/rows";
import { requireStudent } from "@/server/auth/guards";
import { JOB_SOURCES, STATUS_LABEL, WORK_MODES, getSubscriptionState } from "@/server/services/applications";
import { listStudentApplications, listStudentCompanyNames } from "@/server/services/student-applications";
import { formatInTz } from "@/lib/format";
import type { ApplicationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

const FILTER_KEYS = ["q", "status", "from", "to", "company", "source", "mode"] as const;

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user, student } = await requireStudent();
  const t = await getTranslations("student.applications");
  const ts = await getTranslations("status");
  const tsrc = await getTranslations("jobSource");
  const tm = await getTranslations("workMode");
  const [data, companies, sub] = await Promise.all([listStudentApplications(user, sp), listStudentCompanyNames(user), getSubscriptionState(student.id)]);
  const tz = data.timezone;
  const current: Record<string, string | undefined> = Object.fromEntries(FILTER_KEYS.map((k) => [k, sp[k]]));
  const activeFilters = FILTER_KEYS.filter((k) => k !== "q" && sp[k]).length;
  const exportHref = withParams("/api/student/applications/export", current, {});
  const labels = await Promise.all(data.items.map((a) => appliedLabel(a.appliedAt, tz)));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { count: data.total })}
        actions={
          <a href={exportHref} className={buttonVariants({ variant: "outline" })}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("exportCsv")}
          </a>
        }
      />
      {!sub.active ? <RenewBanner /> : null}

      <form method="get" role="search" aria-label={t("filtersLabel")} className="mb-4 grid gap-3 rounded-[16px] border border-border bg-surface p-3 sm:p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input name="q" type="search" defaultValue={sp.q ?? ""} placeholder={t("searchPh")} aria-label={t("search")} className="pl-10" />
          </div>
          <button type="submit" className={buttonVariants()}>
            {t("apply")}
          </button>
        </div>
        <details className="group" open={activeFilters > 0 || undefined}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {t("moreFilters")}
            {activeFilters ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs">{activeFilters}</span> : null}
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            <label className="grid gap-1.5 text-sm font-semibold">
              {t("status")}
              <Select name="status" defaultValue={sp.status ?? ""}>
                <option value="">{t("any")}</option>
                {(Object.keys(STATUS_LABEL) as ApplicationStatus[])
                  .filter((s) => s !== "DRAFT")
                  .map((s) => (
                    <option key={s} value={s}>
                      {ts(s)}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              {t("company")}
              <Select name="company" defaultValue={sp.company ?? ""}>
                <option value="">{t("any")}</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              {t("source")}
              <Select name="source" defaultValue={sp.source ?? ""}>
                <option value="">{t("any")}</option>
                {JOB_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {tsrc(s)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              {t("workMode")}
              <Select name="mode" defaultValue={sp.mode ?? ""}>
                <option value="">{t("any")}</option>
                {WORK_MODES.map((m) => (
                  <option key={m} value={m}>
                    {tm(m)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              {t("from")}
              <Input type="date" name="from" defaultValue={sp.from ?? ""} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              {t("to")}
              <Input type="date" name="to" defaultValue={sp.to ?? ""} />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              {t("apply")}
            </button>
            {activeFilters || sp.q ? (
              <Link href="/app/applications" className={buttonVariants({ size: "sm", variant: "ghost" })}>
                {t("clear")}
              </Link>
            ) : null}
          </div>
        </details>
      </form>

      {data.items.length === 0 ? (
        <EmptyState icon={<Inbox className="h-6 w-6" aria-hidden="true" />} title={activeFilters || sp.q ? t("noMatchTitle") : t("emptyTitle")} body={activeFilters || sp.q ? t("noMatchBody") : t("emptyBody")} className="bg-surface" />
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="grid grid-cols-1 gap-3 md:hidden [&>*]:min-w-0">
            {data.items.map((a, i) => (
              <li key={a.id} className="relative rounded-[16px] border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <CompanyLogo name={a.companyName} domain={a.companyDomain} size={40} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/applications/${a.id}`} className="block font-semibold after:absolute after:inset-0">
                      {a.jobTitle}
                    </Link>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {a.companyName}
                      {a.location ? ` · ${a.location}` : ""}
                    </p>
                  </div>
                  <StatusPill status={a.status} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-muted-foreground">{labels[i]}</span>
                  <span className="relative z-10 flex gap-1">
                    {a.resumeVersionId ? (
                      <a href={`/api/resumes/${a.resumeVersionId}/pdf?inline=1`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1 rounded-[8px] px-2 font-semibold text-primary">
                        <FileText className="h-4 w-4" aria-hidden="true" />
                        {t("resume")}
                      </a>
                    ) : null}
                    <a href={a.jobUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-10 items-center gap-1 rounded-[8px] px-2 font-semibold text-muted-foreground" aria-label={t("jobLinkFor", { title: a.jobTitle })}>
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      {t("job")}
                    </a>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <TableWrap className="hidden md:block">
            <Table>
              <caption className="sr-only">{t("tableCaption")}</caption>
              <THead>
                <tr>
                  <TH>{t("colJob")}</TH>
                  <TH>{t("colApplied")}</TH>
                  <TH>{t("colSource")}</TH>
                  <TH>{t("status")}</TH>
                  <TH className="text-right">{t("colLinks")}</TH>
                </tr>
              </THead>
              <tbody>
                {data.items.map((a) => (
                  <TR key={a.id} className="hover:bg-surface-muted/60">
                    <TD>
                      <div className="flex items-center gap-3">
                        <CompanyLogo name={a.companyName} domain={a.companyDomain} size={36} />
                        <div className="min-w-0">
                          <Link href={`/app/applications/${a.id}`} className="font-semibold hover:text-primary hover:underline">
                            {a.jobTitle}
                          </Link>
                          <p className="text-[13px] text-muted-foreground">
                            {a.companyName}
                            {a.location ? ` · ${a.location}` : ""}
                            {a.workMode ? ` · ${tm(a.workMode)}` : ""}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap tabular">
                      {a.appliedAt ? (
                        <time dateTime={a.appliedAt.toISOString()}>
                          {formatInTz(a.appliedAt, tz, "d MMM yyyy")}
                          <span className="block text-[13px] text-muted-foreground">{formatInTz(a.appliedAt, tz, "h:mm a")}</span>
                        </time>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="whitespace-nowrap">{tsrc(a.source)}</TD>
                    <TD>
                      <StatusPill status={a.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      {a.resumeVersionId ? (
                        <a href={`/api/resumes/${a.resumeVersionId}/pdf?inline=1`} target="_blank" rel="noopener" className="mr-3 inline-flex min-h-9 items-center gap-1 font-semibold text-primary hover:underline" aria-label={t("resumeFor", { title: a.jobTitle })}>
                          <FileText className="h-4 w-4" aria-hidden="true" />
                          {t("resume")}
                        </a>
                      ) : null}
                      <a href={a.jobUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-9 items-center gap-1 font-semibold text-muted-foreground hover:text-foreground" aria-label={t("jobLinkFor", { title: a.jobTitle })}>
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        {t("job")}
                      </a>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination
            label={t("pageLabel", { shown: data.items.length, total: data.total })}
            prevHref={data.prevCursor ? withParams("/app/applications", current, { before: data.prevCursor }) : null}
            nextHref={data.nextCursor ? withParams("/app/applications", current, { after: data.nextCursor }) : null}
          />
        </>
      )}
    </>
  );
}
