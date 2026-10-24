import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { LoadBar } from "@/components/admin/bits";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAction } from "@/server/auth/guards";
import { employeeFormOptions, listEmployees } from "@/server/services/employees";
import { formatInTz, percent } from "@/lib/format";
import { EmployeeFormDialog } from "./employee-form";
import { ResendInviteButton } from "./employee-row-actions";

export const metadata: Metadata = { title: "Employees" };
export const dynamic = "force-dynamic";

const ATT_TONE: Record<string, "green" | "amber" | "red" | "grey" | "cyan" | "slate"> = { IN: "green", PRESENT: "green", HALF_DAY: "amber", ABSENT: "red", ON_LEAVE: "cyan", HOLIDAY: "slate", WEEKEND: "grey" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireAction("employee.manage");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100) || undefined;
  const status = ["all", "INVITED", "DEACTIVATED"].includes(sp.status ?? "") ? sp.status : undefined;
  const [rows, options] = await Promise.all([listEmployees({ q, status }), employeeFormOptions()]);
  const t = await getTranslations("admin.employees");
  const tc = await getTranslations("admin.common");
  const ta = await getTranslations("attendance");
  const tr = await getTranslations("role");
  const marketCode = new Map(options.markets.map((m) => [m.id, m.code]));
  const totals = rows.filter((r) => r.status !== "DEACTIVATED").reduce((a, r) => ({ active: a.active + r.active, max: a.max + r.max, in: a.in + (r.clockedInSince ? 1 : 0) }), { active: 0, max: 0, in: 0 });

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { load: totals.active, capacity: totals.max, in: totals.in })} actions={<EmployeeFormDialog options={options} canManageManagers={user.role === "ADMIN"} />} />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-[18px] border border-border bg-surface p-4">
        <Field id="q" label={tc("search")} className="min-w-[220px] flex-1">
          <Input id="q" name="q" type="search" defaultValue={q} placeholder={t("searchPlaceholder")} />
        </Field>
        <Field id="status" label={t("status")} className="w-[200px]">
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">{t("statusCurrent")}</option>
            <option value="INVITED">{t("statusInvited")}</option>
            <option value="DEACTIVATED">{t("statusDeactivated")}</option>
            <option value="all">{tc("all")}</option>
          </Select>
        </Field>
        <Button type="submit">{tc("apply")}</Button>
        {q || status ? (
          <Link href="/admin/employees" className={buttonVariants({ variant: "ghost" })}>
            {tc("clear")}
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" aria-hidden="true" />} title={t("empty")} body={t("emptyBody")} className="bg-surface" />
      ) : (
        <TableWrap>
          <Table className="min-w-[1080px]">
            <THead>
              <tr>
                <TH>{t("cols.name")}</TH>
                <TH>{t("cols.markets")}</TH>
                <TH>{t("cols.load")}</TH>
                <TH>{t("cols.today")}</TH>
                <TH>{t("cols.attendance")}</TH>
                <TH>{t("cols.lastLogin")}</TH>
                <TH className="text-right">{t("cols.actions")}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((e) => (
                <TR key={e.id} className={e.status === "DEACTIVATED" ? "opacity-60" : undefined}>
                  <TD>
                    <Link href={`/admin/employees/${e.id}`} className="font-semibold hover:underline">
                      {e.name}
                    </Link>
                    <p className="text-[12px] text-muted-foreground">
                      {e.code} · {e.title ?? tr(e.role)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {e.role === "MANAGER" || e.role === "TEAM_LEAD" ? <Badge tone="violet">{tr(e.role)}</Badge> : null}
                      {e.status === "INVITED" ? <Badge tone="amber">{t("invited")}</Badge> : null}
                      {e.status === "DEACTIVATED" ? <Badge tone="grey">{t("deactivated")}</Badge> : null}
                      {!e.accepting && e.status === "ACTIVE" ? <Badge tone="slate">{t("notAccepting")}</Badge> : null}
                    </div>
                  </TD>
                  <TD className="text-[13px]">{e.marketIds.map((id) => marketCode.get(id) ?? "?").join(", ")}</TD>
                  <TD>
                    <LoadBar active={e.active} max={e.max} label={tc("atCapacity")} />
                  </TD>
                  <TD>
                    <p className="tabular text-[13px] font-semibold">
                      {e.appliedToday}
                      <span className="font-normal text-muted-foreground"> / {e.targetToday}</span>
                    </p>
                    <Progress className="mt-1 h-1.5 w-28" value={e.appliedToday} max={Math.max(1, e.targetToday)} label={t("todayLabel", { pct: percent(e.appliedToday, e.targetToday) })} />
                  </TD>
                  <TD>
                    {e.attendance ? (
                      <Badge tone={ATT_TONE[e.attendance] ?? "grey"} dot>
                        {e.attendance === "IN" ? t("clockedInSince", { time: formatInTz(e.clockedInSince!, user.timezone, "h:mm a") }) : ta(e.attendance as "PRESENT")}
                      </Badge>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">{t("notIn")}</span>
                    )}
                  </TD>
                  <TD className="tabular whitespace-nowrap text-[13px]">{e.lastLoginAt ? formatInTz(e.lastLoginAt, user.timezone, "d MMM, h:mm a") : tc("never")}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1.5">
                      {e.status === "INVITED" && ((e.role !== "MANAGER" && e.role !== "TEAM_LEAD") || user.role === "ADMIN") ? <ResendInviteButton employeeId={e.id} name={e.name} /> : null}
                      <Link href={`/admin/employees/${e.id}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={`${tc("view")}: ${e.name}`}>
                        {tc("view")}
                      </Link>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}
