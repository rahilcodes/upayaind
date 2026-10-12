import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GraduationCap } from "lucide-react";
import { SubscriptionStatusPill } from "@/components/billing/status-pills";
import { ExportButtons } from "@/components/admin/export-buttons";
import { TodayProgress } from "@/components/admin/bits";
import { Pagination, withParams } from "@/components/portal/pagination";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { SubscriptionStatus } from "@/generated/prisma/enums";
import { requireAction } from "@/server/auth/guards";
import { listStudents } from "@/server/services/admin-students";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Students" };
export const dynamic = "force-dynamic";

export default async function AdminStudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAction("students.view_all");
  const sp = await searchParams;
  const t = await getTranslations("admin.students");
  const tc = await getTranslations("admin.common");
  const ts = await getTranslations("billing.subStatus");
  const data = await listStudents(sp);
  const f = data.filter;
  const current = { q: f.q, market: f.market, plan: f.plan, status: f.status, employee: f.employee, onboarding: f.onboarding, below: f.below, awaiting: f.awaiting, deleted: f.deleted };
  const filtered = Object.values(current).some(Boolean);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { total: data.total })}
        actions={<ExportButtons href="/api/admin/students/export" params={current} csvLabel={tc("exportCsv")} xlsxLabel={tc("exportXlsx")} />}
      />

      <form method="get" className="mb-5 grid grid-cols-2 gap-3 rounded-[18px] border border-border bg-surface p-4 md:grid-cols-4 xl:grid-cols-[2fr_repeat(4,1fr)]">
        <Field id="q" label={tc("search")} className="col-span-2 md:col-span-4 xl:col-span-1">
          <Input id="q" name="q" type="search" defaultValue={f.q} placeholder={t("searchPlaceholder")} />
        </Field>
        <Field id="market" label={t("market")}>
          <Select id="market" name="market" defaultValue={f.market ?? ""}>
            <option value="">{tc("any")}</option>
            {data.options.markets.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="plan" label={t("plan")}>
          <Select id="plan" name="plan" defaultValue={f.plan ?? ""}>
            <option value="">{tc("any")}</option>
            {data.options.plans.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="status" label={t("status")}>
          <Select id="status" name="status" defaultValue={f.status ?? ""}>
            <option value="">{tc("any")}</option>
            {Object.values(SubscriptionStatus).map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
            <option value="NONE">{t("noPlan")}</option>
          </Select>
        </Field>
        <Field id="employee" label={t("employee")}>
          <Select id="employee" name="employee" defaultValue={f.employee ?? ""}>
            <option value="">{tc("any")}</option>
            <option value="none">{tc("unassigned")}</option>
            {data.options.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 md:col-span-4 xl:col-span-5">
          <legend className="sr-only">{t("quickFilters")}</legend>
          {(
            [
              ["below", "1", t("belowTarget")],
              ["onboarding", "incomplete", t("onboardingIncomplete")],
              ["awaiting", "1", t("awaiting")],
            ] as const
          ).map(([name, value, label]) => (
            <label key={name} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" name={name} value={value} defaultChecked={(current as Record<string, string | undefined>)[name] === value} className="h-[18px] w-[18px] accent-[var(--primary)]" />
              {label}
            </label>
          ))}
          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <span>{t("deletion")}</span>
            <select name="deleted" defaultValue={f.deleted ?? ""} className="h-11 rounded-[10px] border-[1.5px] border-border-strong bg-surface px-2 text-sm">
              <option value="">{t("deletionActive")}</option>
              <option value="requested">{t("deletionRequested")}</option>
              <option value="deleted">{t("deletionDeleted")}</option>
            </select>
          </label>
          <div className="ml-auto flex gap-2">
            {filtered ? (
              <Link href="/admin/students" className={buttonVariants({ variant: "ghost" })}>
                {tc("clear")}
              </Link>
            ) : null}
            <Button type="submit">{tc("apply")}</Button>
          </div>
        </fieldset>
      </form>

      {data.items.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-6 w-6" aria-hidden="true" />} title={filtered ? t("emptyFiltered") : t("empty")} body={filtered ? t("emptyFilteredBody") : t("emptyBody")} className="bg-surface" />
      ) : (
        <TableWrap>
          <Table className="min-w-[1100px]">
            <THead>
              <tr>
                <TH>{t("cols.name")}</TH>
                <TH>{t("cols.market")}</TH>
                <TH>{t("cols.plan")}</TH>
                <TH>{t("cols.status")}</TH>
                <TH>{t("cols.periodEnd")}</TH>
                <TH>{t("cols.employee")}</TH>
                <TH>{t("cols.today")}</TH>
                <TH className="text-right">{t("cols.applications")}</TH>
                <TH className="text-right">{t("cols.interviews")}</TH>
              </tr>
            </THead>
            <tbody>
              {data.items.map((s) => (
                <TR key={s.id} className="hover:bg-surface-muted/60">
                  <TD>
                    <Link href={`/admin/students/${s.id}`} className="font-semibold hover:underline">
                      {s.name}
                    </Link>
                    <p className="text-[12px] text-muted-foreground">{s.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {!s.onboarded ? <Badge tone="amber">{t("badgeOnboarding")}</Badge> : null}
                      {s.deletedAt ? <Badge tone="red">{t("badgeDeleted")}</Badge> : s.deletionRequestedAt ? <Badge tone="red">{t("badgeDeletion")}</Badge> : null}
                    </div>
                  </TD>
                  <TD className="font-medium">{s.market}</TD>
                  <TD className="text-[13px]">{s.plan ?? <span className="text-muted-foreground">—</span>}</TD>
                  <TD>{s.status ? <SubscriptionStatusPill status={s.status} /> : <Badge tone="outline">{t("noPlan")}</Badge>}</TD>
                  <TD className="tabular whitespace-nowrap text-[13px]">{s.periodEnd ? formatDate(s.periodEnd, user.timezone) : "—"}</TD>
                  <TD className="text-[13px]">
                    {s.employee ? (
                      <Link href={`/admin/employees/${s.employeeId}`} className="hover:underline">
                        {s.employee}
                      </Link>
                    ) : s.awaiting ? (
                      <Badge tone="amber">{t("awaiting")}</Badge>
                    ) : (
                      <span className="text-muted-foreground">{tc("unassigned")}</span>
                    )}
                  </TD>
                  <TD>{s.today ? <TodayProgress applied={s.today.applied} target={s.today.target} rag={s.today.rag} /> : <span className="text-muted-foreground">—</span>}</TD>
                  <TD className="tabular text-right font-semibold">{s.applications}</TD>
                  <TD className="tabular text-right">{s.interviews}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
      <Pagination
        prevHref={f.cursor ? withParams("/admin/students", current, {}) : null}
        nextHref={data.nextCursor ? withParams("/admin/students", current, { cursor: data.nextCursor }) : null}
        label={tc("pagination", { count: data.total })}
      />
    </>
  );
}
