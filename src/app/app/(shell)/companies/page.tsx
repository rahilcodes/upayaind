import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Building2, Search } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { CompanyLogo } from "@/components/portal/company-logo";
import { StatusPill } from "@/components/portal/status-pill";
import { Pagination, withParams } from "@/components/portal/pagination";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { requireStudent } from "@/server/auth/guards";
import { listStudentCompanies } from "@/server/services/student-applications";
import { formatInTz } from "@/lib/format";

export const metadata: Metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { user } = await requireStudent();
  const t = await getTranslations("student.companies");
  const page = Number(sp.page) || 1;
  const q = sp.q?.trim().slice(0, 120) || undefined;
  const data = await listStudentCompanies(user, { q, page });
  const tz = user.timezone;
  const cur = { q };

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { count: data.totalCompanies })} />
      <form method="get" role="search" className="mb-4 flex gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" name="q" defaultValue={q ?? ""} placeholder={t("searchPh")} aria-label={t("search")} className="pl-10" />
        </div>
        <button className={buttonVariants({ variant: "outline" })}>{t("search")}</button>
      </form>
      {data.companies.length === 0 ? (
        <EmptyState icon={<Building2 className="h-6 w-6" aria-hidden="true" />} title={q ? t("noMatch") : t("emptyTitle")} body={q ? undefined : t("emptyBody")} className="bg-surface" />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0">
          {data.companies.map((c) => (
            <li key={c.companyName} className="rounded-[16px] border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <CompanyLogo name={c.companyName} domain={c.domain} size={44} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold">
                    <Link href={withParams("/app/applications", {}, { company: c.companyName })} className="hover:text-primary hover:underline">
                      {c.companyName}
                    </Link>
                  </h2>
                  <p className="text-[13px] text-muted-foreground">
                    {t("count", { count: c.count })}
                    {c.lastAppliedAt ? ` · ${t("last", { date: formatInTz(c.lastAppliedAt, tz, "d MMM") })}` : ""}
                  </p>
                </div>
                <StatusPill status={c.latestStatus} />
              </div>
              <ul className="mt-3 grid gap-0.5 border-t border-border pt-2">
                {c.roles.map((r) => (
                  <li key={r.id}>
                    <Link href={`/app/applications/${r.id}`} className="flex min-h-10 items-center gap-2 rounded-[8px] px-1 text-sm hover:bg-surface-muted">
                      <span className="min-w-0 flex-1 truncate">{r.jobTitle}</span>
                      <span className="shrink-0 text-[13px] text-muted-foreground tabular">{r.appliedAt ? formatInTz(r.appliedAt, tz, "d MMM") : ""}</span>
                      <StatusPill status={r.status} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
              {c.moreRoles ? (
                <Link href={withParams("/app/applications", {}, { company: c.companyName })} className="mt-1 inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline">
                  {t("more", { count: c.moreRoles })}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination label={t("page", { page: data.page })} prevHref={data.page > 1 ? withParams("/app/companies", cur, { page: String(data.page - 1) }) : null} nextHref={data.hasNext ? withParams("/app/companies", cur, { page: String(data.page + 1) }) : null} />
    </>
  );
}
