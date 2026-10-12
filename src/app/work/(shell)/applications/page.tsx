import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, List, Search } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Pagination, withParams } from "@/components/portal/pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { requireStaff } from "@/server/auth/guards";
import { JOB_SOURCES, STATUS_LABEL, TRANSITIONS } from "@/server/services/applications";
import { listMyApplications } from "@/server/services/work-dashboard";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { formatInTz } from "@/lib/format";
import { ApplicationsTable } from "./applications-table";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.applications");
  return { title: t("metaTitle") };
}

/** /work/applications — everything I logged (filters, bulk status, CSV export). */
export default async function MyApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user } = await requireStaff();
  const sp = await searchParams;
  const t = await getTranslations("work.applications");
  const tc = await getTranslations("work.common");
  const ts = await getTranslations("status");
  const tj = await getTranslations("jobSource");
  const data = await listMyApplications(user, sp);
  if (!data) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState className="bg-surface" title={tc("noProfileTitle")} body={tc("noProfileBody")} action={<Link href="/admin/applications" className={buttonVariants()}>{t("allApplications")}</Link>} />
      </>
    );
  }
  const f = data.filter;
  const current = { q: f.q, status: f.status, student: f.student, source: f.source, from: f.from, to: f.to, highlight: sp.highlight };
  const filtered = Boolean(f.q || f.status || f.student || f.source || f.from || f.to);
  const exportHref = withParams("/work/applications/export", { ...current, highlight: undefined }, {});

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { count: data.total })}
        actions={
          <a href={exportHref} className={buttonVariants({ variant: "outline" })} download>
            <Download className="h-4 w-4" aria-hidden="true" />
            {t("export")}
          </a>
        }
      />
      <form method="get" className="mb-5 grid grid-cols-2 gap-3 rounded-[18px] border border-border bg-surface p-4 lg:grid-cols-[2fr_repeat(5,1fr)_auto] lg:items-end">
        <Field id="q" label={tc("search")} className="col-span-2 lg:col-span-1">
          <Input id="q" name="q" type="search" defaultValue={f.q} placeholder={t("searchPlaceholder")} />
        </Field>
        <Field id="status" label={t("col.status")}>
          <Select id="status" name="status" defaultValue={f.status ?? ""}>
            <option value="">{tc("any")}</option>
            {(Object.keys(STATUS_LABEL) as ApplicationStatus[]).map((s) => <option key={s} value={s}>{ts(s)}</option>)}
          </Select>
        </Field>
        <Field id="student" label={t("col.student")}>
          <Select id="student" name="student" defaultValue={f.student ?? ""}>
            <option value="">{tc("any")}</option>
            {data.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field id="source" label={t("col.source")}>
          <Select id="source" name="source" defaultValue={f.source ?? ""}>
            <option value="">{tc("any")}</option>
            {JOB_SOURCES.map((s) => <option key={s} value={s}>{tj(s)}</option>)}
          </Select>
        </Field>
        <Field id="from" label={t("from")}>
          <Input id="from" name="from" type="date" defaultValue={f.from} />
        </Field>
        <Field id="to" label={t("to")}>
          <Input id="to" name="to" type="date" defaultValue={f.to} />
        </Field>
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          <Button type="submit"><Search className="h-4 w-4" aria-hidden="true" />{tc("apply")}</Button>
          {filtered ? <Link href="/work/applications" className={buttonVariants({ variant: "ghost" })}>{tc("clear")}</Link> : null}
        </div>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState className="bg-surface" icon={<List className="h-6 w-6" aria-hidden="true" />} title={filtered ? t("noMatch") : t("emptyTitle")} body={filtered ? undefined : t("emptyBody")} />
      ) : (
        <>
          <ApplicationsTable
            highlight={sp.highlight}
            rows={data.rows.map((r) => ({
              id: r.id,
              companyName: r.companyName,
              companyDomain: r.companyDomain,
              jobTitle: r.jobTitle,
              status: r.status,
              source: r.source,
              sourceLabel: tj(r.source),
              when: formatInTz(r.appliedAt ?? r.createdAt, data.timezone, "d MMM yyyy, h:mm a"),
              jobUrl: r.jobUrl,
              studentId: r.studentId,
              studentName: r.studentName,
              canUpdate: r.canUpdate,
              allowed: TRANSITIONS[r.status],
            }))}
          />
          <Pagination
            label={t("showing", { count: data.rows.length, total: data.total })}
            prevHref={sp.cursor ? withParams("/work/applications", current, { cursor: null, highlight: null }) : null}
            nextHref={data.nextCursor ? withParams("/work/applications", current, { cursor: data.nextCursor, highlight: null }) : null}
          />
        </>
      )}
    </>
  );
}
