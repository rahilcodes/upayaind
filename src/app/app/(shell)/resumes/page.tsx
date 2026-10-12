import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileText, Pencil, Upload, UserRound } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { CompanyLogo } from "@/components/portal/company-logo";
import { StatusPill } from "@/components/portal/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadLinks } from "@/components/student/rows";
import { requireStudent } from "@/server/auth/guards";
import { getStudentResumes } from "@/server/services/student-applications";
import { formatInTz } from "@/lib/format";

export const metadata: Metadata = { title: "Resumes" };
export const dynamic = "force-dynamic";

/** F6: master profile + base resume + every tailored version (grouped by job). */
export default async function ResumesPage() {
  const { user } = await requireStudent();
  const t = await getTranslations("student.resumes");
  const r = await getStudentResumes(user);
  const tz = user.timezone;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-[18px] w-[18px]" aria-hidden="true" />
              {t("master")}
            </CardTitle>
            <Link href="/app/profile#master" className={buttonVariants({ size: "sm", variant: "outline" })}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {t("edit")}
            </Link>
          </CardHeader>
          <CardContent>
            {r.master ? (
              <>
                <p className="text-lg font-bold">{r.master.name}</p>
                {r.master.headline ? <p className="text-sm text-muted-foreground">{r.master.headline}</p> : null}
                {r.master.latestRole ? <p className="mt-1 text-sm">{r.master.latestRole}</p> : null}
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {(["experience", "skills", "education", "projects"] as const).map((k) => (
                    <div key={k} className="rounded-[12px] bg-surface-muted px-1 py-2.5">
                      <dd className="text-xl font-bold tabular">{r.master![k]}</dd>
                      <dt className="text-[12px] text-muted-foreground">{t(`stat.${k}`)}</dt>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[13px] text-muted-foreground">{t("masterNote")}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noMaster")}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-[18px] w-[18px]" aria-hidden="true" />
              {t("base")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {r.base ? (
              <>
                <p className="text-sm text-muted-foreground">{t("baseNote")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`/api/resumes/${r.base.id}/pdf?inline=1`} target="_blank" rel="noopener" className={buttonVariants({ size: "sm" })}>
                    {t("view")}
                  </a>
                  <DownloadLinks versionId={r.base.id} label={t("base")} />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noBase")}</p>
            )}
            {r.uploads.length ? (
              <div className="mt-2 border-t border-border pt-3">
                <p className="mb-1 text-sm font-semibold">{t("uploads")}</p>
                <ul className="grid gap-1">
                  {r.uploads.map((u) => (
                    <li key={u.id}>
                      <a href={`/api/files/${u.id}`} className="flex min-h-10 items-center gap-2 rounded-[8px] px-1 text-sm hover:bg-surface-muted">
                        <Upload className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{u.filename ?? t("uploadedFile")}</span>
                        <span className="text-[13px] text-muted-foreground">{formatInTz(u.createdAt, tz, "d MMM yyyy")}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="tailored-h" className="mt-8">
        <h2 id="tailored-h" className="text-[17px] font-bold">
          {t("tailored")} <span className="text-muted-foreground tabular">({r.jobs.length})</span>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("tailoredNote")}</p>
        {r.jobs.length === 0 ? (
          <EmptyState icon={<FileText className="h-6 w-6" aria-hidden="true" />} title={t("emptyTitle")} body={t("emptyBody")} className="bg-surface" />
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {r.jobs.map((j) => (
              <li key={j.key} className="flex min-w-0 flex-col gap-3 rounded-[16px] border border-border bg-surface p-4 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <CompanyLogo name={j.companyName} domain={j.companyDomain} size={40} />
                  <div className="min-w-0">
                    <Link href={`/app/applications/${j.applicationId}`} className="block truncate font-semibold hover:text-primary">
                      {j.jobTitle}
                    </Link>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {j.companyName}
                      {j.appliedAt ? ` · ${formatInTz(j.appliedAt, tz, "d MMM yyyy")}` : ""}
                    </p>
                  </div>
                  <StatusPill status={j.status} className="ml-auto md:ml-0" />
                </div>
                <div className="grid gap-2">
                  {j.versions.map((v, i) => (
                    <div key={v.id} className="flex flex-wrap items-center gap-2">
                      {j.versions.length > 1 ? <span className="text-[13px] text-muted-foreground">{t("version", { n: j.versions.length - i })}</span> : null}
                      <a href={`/api/resumes/${v.id}/pdf?inline=1`} target="_blank" rel="noopener" className={buttonVariants({ size: "sm", variant: "secondary" })}>
                        {t("view")}
                      </a>
                      <DownloadLinks versionId={v.id} label={`${j.jobTitle} ${j.companyName}`} />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
