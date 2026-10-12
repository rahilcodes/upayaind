import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BarChart3 } from "lucide-react";
import { ExportButtons } from "@/components/admin/export-buttons";
import { PageHeader } from "@/components/portal/portal-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAction } from "@/server/auth/guards";
import { db } from "@/server/db";
import { REPORT_KEYS, resolveRange, runReport, type Column, type ReportKey, type Row } from "@/server/services/reports";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

function Cell({ col, row }: { col: Column; row: Row }) {
  const v = row[col.key];
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  switch (col.type) {
    case "money":
      return <>{formatMoney(Number(v), String(row.currency ?? "USD"))}</>;
    case "pct":
      return <>{Number(v).toFixed(1)}%</>;
    case "minutes":
      return <>{Number(v).toFixed(1)} min</>;
    case "decimal":
      return <>{Number(v).toFixed(1)}</>;
    default:
      return <>{String(v)}</>;
  }
}

/** Link the name columns back to Student 360 / employee pages. */
function linkFor(key: ReportKey, col: Column, row: Row) {
  if (!row.id) return null;
  if (key === "delivery-students" && col.key === "student") return `/admin/students/${row.id}`;
  if ((key === "delivery-employees" || key === "staff") && col.key === "employee") return `/admin/employees/${row.id}`;
  return null;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAction("reports.view");
  const sp = await searchParams;
  const key: ReportKey = REPORT_KEYS.includes(sp.tab as ReportKey) ? (sp.tab as ReportKey) : "revenue";
  const range = resolveRange(sp, user.timezone);
  const t = await getTranslations("admin.reports");
  const tc = await getTranslations("admin.common");
  const [table, markets] = await Promise.all([runReport(key, range), db.market.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true } })]);
  const params = { from: range.fromKey, to: range.toKey, market: range.market };
  const tabHref = (k: ReportKey) => `/admin/reports?${new URLSearchParams({ tab: k, from: range.fromKey, to: range.toKey, ...(range.market ? { market: range.market } : {}) }).toString()}`;
  const numeric = (c: Column) => c.type !== "text";

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<ExportButtons href={`/api/admin/reports/${key}`} params={params} csvLabel={tc("exportCsv")} xlsxLabel={tc("exportXlsx")} />} />

      <nav aria-label={t("reportsNav")} className="mb-4 overflow-x-auto">
        <ul className="inline-flex gap-1 rounded-[14px] bg-surface-muted p-1">
          {REPORT_KEYS.map((k) => (
            <li key={k}>
              <Link href={tabHref(k)} aria-current={k === key ? "page" : undefined} className={cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-[10px] px-4 text-sm font-semibold", k === key ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {t(`tabs.${k}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-[18px] border border-border bg-surface p-4">
        <input type="hidden" name="tab" value={key} />
        <Field id="from" label={key === "retention" ? t("cohortFrom") : tc("from")} className="w-[170px]">
          <Input id="from" name="from" type="date" defaultValue={range.fromKey} />
        </Field>
        <Field id="to" label={tc("to")} className="w-[170px]">
          <Input id="to" name="to" type="date" defaultValue={range.toKey} />
        </Field>
        <Field id="market" label={t("market")} className="w-[180px]">
          <Select id="market" name="market" defaultValue={range.market ?? ""}>
            <option value="">{tc("all")}</option>
            {markets.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit">{tc("apply")}</Button>
      </form>

      <p className="mb-3 max-w-3xl text-sm text-muted-foreground">{t(`help.${key}`)}</p>

      {table.rows.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-6 w-6" aria-hidden="true" />} title={t("empty")} body={t("emptyBody")} className="bg-surface" />
      ) : (
        <TableWrap>
          <Table className="min-w-[720px]">
            <caption className="sr-only">{t(`tabs.${key}`)}</caption>
            <THead>
              <tr>
                {table.columns.map((c) => (
                  <TH key={c.key} className={numeric(c) ? "text-right" : undefined}>
                    {t(`cols.${c.key}` as "cols.month")}
                  </TH>
                ))}
              </tr>
            </THead>
            <tbody>
              {table.rows.map((r, i) => (
                <TR key={String(r.id ?? i)}>
                  {table.columns.map((c, ci) => {
                    const href = linkFor(key, c, r);
                    return (
                      <TD key={c.key} className={cn(numeric(c) && "tabular text-right", ci === 0 && "whitespace-nowrap font-semibold", c.key === "code" && "whitespace-nowrap", c.key === "adherence" && typeof r[c.key] === "number" && Number(r[c.key]) < 80 && "text-warning")}>
                        {href ? (
                          <Link href={href} className="hover:underline">
                            <Cell col={c} row={r} />
                          </Link>
                        ) : (
                          <Cell col={c} row={r} />
                        )}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
