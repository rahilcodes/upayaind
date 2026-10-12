import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, ExternalLink, ListChecks } from "lucide-react";
import { ExportButtons } from "@/components/admin/export-buttons";
import { Pagination, withParams } from "@/components/portal/pagination";
import { PageHeader } from "@/components/portal/portal-shell";
import { StatusPill } from "@/components/portal/status-pill";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { ApplicationStatus, JobSource } from "@/generated/prisma/enums";
import { requireAction } from "@/server/auth/guards";
import { listAllApplications } from "@/server/services/admin-applications";
import { TRANSITIONS } from "@/server/services/applications";
import { formatInTz } from "@/lib/format";
import { AdminStatusDialog } from "./status-dialog";

export const metadata: Metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

export default async function AdminApplicationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAction("students.view_all");
  const sp = await searchParams;
  const t = await getTranslations("admin.applications");
  const tc = await getTranslations("admin.common");
  const ts = await getTranslations("status");
  const tj = await getTranslations("jobSource");
  const data = await listAllApplications(sp);
  const f = data.filter;
  const current = { q: f.q, status: f.status, source: f.source, market: f.market, employee: f.employee, student: f.student, from: f.from, to: f.to };
  const filtered = Object.values(current).some(Boolean);
  const statuses = Object.values(ApplicationStatus).filter((s) => s !== "DRAFT");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={data.studentName ? t("descriptionStudent", { name: data.studentName, total: data.total }) : t("description", { total: data.total })}
        actions={<ExportButtons href="/api/admin/applications/export" params={current} csvLabel={tc("exportCsv")} xlsxLabel={tc("exportXlsx")} />}
      />

      <form method="get" className="mb-4 grid grid-cols-2 gap-3 rounded-[18px] border border-border bg-surface p-4 md:grid-cols-4 xl:grid-cols-[2fr_repeat(6,1fr)_auto] xl:items-end">
        {f.student ? <input type="hidden" name="student" value={f.student} /> : null}
        <Field id="q" label={tc("search")} className="col-span-2 md:col-span-4 xl:col-span-1">
          <Input id="q" name="q" type="search" defaultValue={f.q} placeholder={t("searchPlaceholder")} />
        </Field>
        <Field id="status" label={t("status")}>
          <Select id="status" name="status" defaultValue={f.status ?? ""}>
            <option value="">{tc("any")}</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="source" label={t("source")}>
          <Select id="source" name="source" defaultValue={f.source ?? ""}>
            <option value="">{tc("any")}</option>
            {Object.values(JobSource).map((s) => (
              <option key={s} value={s}>
                {tj(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="market" label={t("market")}>
          <Select id="market" name="market" defaultValue={f.market ?? ""}>
            <option value="">{tc("any")}</option>
            {data.markets.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="employee" label={t("employee")}>
          <Select id="employee" name="employee" defaultValue={f.employee ?? ""}>
            <option value="">{tc("any")}</option>
            {data.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="from" label={tc("from")}>
          <Input id="from" name="from" type="date" defaultValue={f.from} />
        </Field>
        <Field id="to" label={tc("to")}>
          <Input id="to" name="to" type="date" defaultValue={f.to} />
        </Field>
        <div className="col-span-2 flex gap-2 md:col-span-4 xl:col-span-1">
          <Button type="submit" className="flex-1 xl:flex-none">
            {tc("apply")}
          </Button>
          {filtered ? (
            <Link href="/admin/applications" className={buttonVariants({ variant: "ghost" })}>
              {tc("clear")}
            </Link>
          ) : null}
        </div>
      </form>

      <nav aria-label={t("byStatus")} className="mb-4 flex flex-wrap gap-2">
        {statuses
          .filter((s) => data.byStatus[s])
          .map((s) => (
            <Link
              key={s}
              href={withParams("/admin/applications", current, { status: f.status === s ? null : s, cursor: null })}
              aria-current={f.status === s ? "true" : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold ${f.status === s ? "border-primary bg-accent text-accent-foreground" : "border-border bg-surface text-muted-foreground hover:text-foreground"}`}
            >
              {ts(s)} <span className="tabular">{data.byStatus[s]}</span>
            </Link>
          ))}
      </nav>

      {data.items.length === 0 ? (
        <EmptyState icon={<ListChecks className="h-6 w-6" aria-hidden="true" />} title={filtered ? t("emptyFiltered") : t("empty")} className="bg-surface" />
      ) : (
        <TableWrap>
          <Table className="min-w-[1120px]">
            <THead>
              <tr>
                <TH>{t("cols.appliedAt")}</TH>
                <TH>{t("cols.student")}</TH>
                <TH>{t("cols.company")}</TH>
                <TH>{t("cols.title")}</TH>
                <TH>{t("cols.source")}</TH>
                <TH>{t("cols.employee")}</TH>
                <TH>{t("cols.status")}</TH>
                <TH className="text-right">{t("cols.actions")}</TH>
              </tr>
            </THead>
            <tbody>
              {data.items.map((a) => (
                <TR key={a.id}>
                  <TD className="tabular whitespace-nowrap text-[13px]">{a.appliedAt ? formatInTz(a.appliedAt, user.timezone, "d MMM yyyy, h:mm a") : "—"}</TD>
                  <TD>
                    <Link href={`/admin/students/${a.studentId}`} className="font-semibold hover:underline">
                      {a.student.user.name}
                    </Link>
                    <span className="block text-[12px] text-muted-foreground">{a.student.market.code}</span>
                  </TD>
                  <TD className="font-medium">{a.companyName}</TD>
                  <TD>
                    <a href={a.jobUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:underline">
                      {a.jobTitle}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      <span className="sr-only">{t("opensNewTab")}</span>
                    </a>
                    {a.location ? <span className="block text-[12px] text-muted-foreground">{a.location}</span> : null}
                  </TD>
                  <TD className="text-[13px]">{tj(a.source)}</TD>
                  <TD className="text-[13px]">
                    <Link href={`/admin/employees/${a.employee.id}`} className="hover:underline">
                      {a.employee.user.name}
                    </Link>
                  </TD>
                  <TD>
                    <StatusPill status={a.status} />
                    <span className="tabular mt-1 block text-[11px] text-muted-foreground">{formatInTz(a.lastStatusAt, user.timezone, "d MMM")}</span>
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      {a.resumeVersionId ? (
                        <a href={`/api/resumes/${a.resumeVersionId}/pdf`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={t("resumeFor", { company: a.companyName })}>
                          <Download className="h-4 w-4" aria-hidden="true" />
                        </a>
                      ) : null}
                      <AdminStatusDialog applicationId={a.id} label={`${a.jobTitle} · ${a.companyName}`} status={a.status} allowed={TRANSITIONS[a.status]} timezone={user.timezone} />
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
      <Pagination
        prevHref={f.cursor ? withParams("/admin/applications", current, {}) : null}
        nextHref={data.nextCursor ? withParams("/admin/applications", current, { cursor: data.nextCursor }) : null}
        label={tc("pagination", { count: data.total })}
      />
    </>
  );
}
