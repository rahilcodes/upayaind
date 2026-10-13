import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, LogIn, ShieldAlert } from "lucide-react";
import { KeyValue, LoadBar, Section, TodayProgress } from "@/components/admin/bits";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Table, TableWrap, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAction } from "@/server/auth/guards";
import { employeeFormOptions, getEmployeeDetail } from "@/server/services/employees";
import { ragFor, proratedExpected } from "@/server/services/admin-metrics";
import { addDayKey, formatMinutes, weekdayOfKey } from "@/lib/dates";
import { formatDate, formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmployeeFormDialog } from "../employee-form";
import { DeactivateButton, ReactivateButton, ResendInviteButton, ResetTwoFactorButton } from "../employee-row-actions";

export const metadata: Metadata = { title: "Employee" };
export const dynamic = "force-dynamic";

const CAL_TONE: Record<string, string> = {
  PRESENT: "bg-success text-white",
  HALF_DAY: "bg-warning text-white",
  ABSENT: "bg-danger text-white",
  ON_LEAVE: "bg-[#38B6FF] text-ink",
  HOLIDAY: "bg-[#C9D1EC] text-ink",
  WEEKEND: "bg-surface-muted text-muted-foreground",
};

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAction("employee.manage");
  const { id } = await params;
  const [e, options] = await Promise.all([getEmployeeDetail(id), employeeFormOptions()]);
  if (!e) notFound();
  const t = await getTranslations("admin.employeeDetail");
  const te = await getTranslations("admin.employees");
  const tc = await getTranslations("admin.common");
  const ta = await getTranslations("attendance");
  const tr = await getTranslations("role");
  const td = await getTranslations("admin.days");
  const tz = user.timezone;
  const isAdmin = user.role === "ADMIN";
  const canManage = e.user.role === "EMPLOYEE" || isAdmin;
  const self = e.user.id === user.id;

  // Calendar: 6 weeks ending this week (Mon–Sun columns).
  const dayMap = new Map(e.days.map((d) => [d.key, d]));
  const lastSunday = addDayKey(e.todayKey, 7 - weekdayOfKey(e.todayKey));
  const firstMonday = addDayKey(lastSunday, -41);
  const cells = Array.from({ length: 42 }, (_, i) => addDayKey(firstMonday, i));

  const minutesNow = Number(formatInTz(new Date(), e.user.timezone, "H")) * 60 + Number(formatInTz(new Date(), e.user.timezone, "m"));
  const startMin = Number(e.schedule.startTime.slice(0, 2)) * 60 + Number(e.schedule.startTime.slice(3, 5));

  return (
    <>
      <Link href="/admin/employees" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <PageHeader
        title={e.user.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {e.code} · {e.title ?? tr(e.user.role)}
            </span>
            {e.user.role === "MANAGER" ? <Badge tone="violet">{tr("MANAGER")}</Badge> : null}
            {e.user.status === "INVITED" ? <Badge tone="amber">{te("invited")}</Badge> : null}
            {e.user.status === "DEACTIVATED" ? <Badge tone="grey">{te("deactivated")}</Badge> : null}
            {!e.accepting && e.user.status === "ACTIVE" ? <Badge tone="slate">{te("notAccepting")}</Badge> : null}
          </span>
        }
        actions={
          canManage && !self ? (
            <>
              {e.user.status === "INVITED" ? <ResendInviteButton employeeId={e.id} name={e.user.name} /> : null}
              {e.user.status !== "DEACTIVATED" ? (
                <EmployeeFormDialog
                  options={options}
                  canManageManagers={isAdmin}
                  value={{ employeeId: e.id, name: e.user.name, email: e.user.email, phone: e.user.phone, title: e.title, marketIds: e.marketIds, maxStudents: e.maxStudents, managerId: e.managerId, timezone: e.user.timezone, schedule: e.schedule, role: e.user.role === "MANAGER" ? "MANAGER" : "EMPLOYEE", acceptingNewStudents: e.accepting }}
                />
              ) : null}
              {isAdmin && e.user.status === "ACTIVE" && e.user.totpEnabled ? <ResetTwoFactorButton employeeId={e.id} name={e.user.name} /> : null}
              {e.user.status === "DEACTIVATED" ? <ReactivateButton employeeId={e.id} /> : <DeactivateButton employeeId={e.id} name={e.user.name} students={e.activeLoad} />}
            </>
          ) : null
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Section id="perf" title={t("performanceTitle")} description={t("performanceDescription")}>
            <div className="grid gap-4 md:grid-cols-3">
              {e.performance.map((p) => (
                <div key={p.key} className="rounded-[14px] border border-border p-4">
                  <p className="text-sm font-semibold text-muted-foreground">{t(`period.${p.key}`)}</p>
                  <p className="tabular mt-1 text-[28px] font-bold leading-tight">{p.applications}</p>
                  <p className="text-[13px] text-muted-foreground">{t("applications")}</p>
                  <dl className="mt-3 grid gap-1.5 text-[13px]">
                    {(
                      [
                        [t("perDay"), p.perDay.toFixed(1)],
                        [t("targetMet"), p.targetMetPct === null ? "—" : `${p.targetMetPct}%`],
                        [t("responseRate"), p.responseRate === null ? "—" : `${p.responseRate}%`],
                        [t("interviews"), String(p.interviews)],
                        [t("genToLog"), p.avgGenToLogMin === null ? "—" : t("minutes", { n: Math.round(p.avgGenToLogMin * 10) / 10 })],
                        [t("activeHours"), formatMinutes(p.activeMinutes)],
                      ] as const
                    ).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="tabular whitespace-nowrap font-semibold">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </Section>

          <Section id="students" title={t("studentsTitle")} actions={<LoadBar active={e.activeLoad} max={e.maxStudents} label={tc("atCapacity")} className="w-48" />}>
            {e.students.length ? (
              <TableWrap className="border-0">
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("student")}</TH>
                      <TH>{t("plan")}</TH>
                      <TH>{t("today")}</TH>
                      <TH>{t("since")}</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {e.students.map((s) => {
                      const expected = proratedExpected(s.target, minutesNow, startMin, e.schedule.hours);
                      return (
                        <TR key={s.assignmentId}>
                          <TD>
                            <Link href={`/admin/students/${s.id}`} className="font-semibold hover:underline">
                              {s.name}
                            </Link>
                            <p className="text-[12px] text-muted-foreground">
                              {s.market}
                              {s.type === "COVER" ? ` · ${t("cover")}` : ""}
                            </p>
                          </TD>
                          <TD className="text-[13px]">{s.plan ?? <span className="text-muted-foreground">{t("inactive")}</span>}</TD>
                          <TD>{s.plan ? <TodayProgress applied={s.today} target={s.target} rag={ragFor(s.today, s.target, expected)} /> : "—"}</TD>
                          <TD className="tabular text-[13px]">
                            {formatDate(s.startsAt, tz)}
                            {s.endsAt ? ` – ${formatDate(s.endsAt, tz)}` : ""}
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            ) : (
              <EmptyState title={t("noStudents")} className="py-8" />
            )}
          </Section>

          <Section id="calendar" title={t("calendarTitle")} description={t("calendarDescription")}>
            <div tabIndex={0} role="region" aria-label="Attendance" className="overflow-x-auto">
              <div className="grid min-w-[420px] grid-cols-7 gap-1.5" role="grid" aria-label={t("calendarTitle")}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <div key={d} role="columnheader" className="pb-1 text-center text-[12px] font-semibold text-muted-foreground">
                    {td(String(d) as "1")}
                  </div>
                ))}
                {cells.map((k) => {
                  const d = dayMap.get(k);
                  const future = k > e.todayKey;
                  const label = `${formatDate(new Date(`${k}T12:00:00Z`), "UTC")}: ${d ? ta(d.status) : future ? "" : t("noRecord")}${d?.clockedMinutes ? ` · ${formatMinutes(d.clockedMinutes)}` : ""}`;
                  return (
                    <div
                      key={k}
                      role="gridcell"
                      title={label}
                      aria-label={label}
                      className={cn(
                        "flex h-12 flex-col items-center justify-center rounded-[10px] text-[12px] font-semibold",
                        d ? CAL_TONE[d.status] : future ? "border border-dashed border-border text-subtle-foreground" : "border border-border text-muted-foreground",
                        k === e.todayKey && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
                      )}
                    >
                      <span className="tabular">{Number(k.slice(8, 10))}</span>
                      {d?.clockedMinutes ? <span className="tabular text-[10px] font-medium opacity-90">{Math.round(d.clockedMinutes / 6) / 10}h</span> : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground" aria-label={t("legend")}>
              {Object.keys(CAL_TONE).map((s) => (
                <li key={s} className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn("h-3 w-3 rounded", CAL_TONE[s])} />
                  {ta(s as "PRESENT")}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section id="details" title={t("detailsTitle")}>
            <KeyValue
              className="sm:grid-cols-1"
              items={[
                { label: t("email"), value: e.user.email },
                { label: t("phone"), value: e.user.phone },
                { label: t("markets"), value: e.markets.map((m) => m.name).join(", ") || "—" },
                { label: t("manager"), value: e.managerName },
                { label: t("schedule"), value: t("scheduleValue", { days: e.schedule.days.map((d) => td(String(d) as "1")).join(" "), start: e.schedule.startTime, hours: e.schedule.hours }) },
                { label: t("timezone"), value: e.user.timezone },
                { label: t("joined"), value: e.joiningDate ? formatDate(e.joiningDate, tz) : formatDate(e.user.createdAt, tz) },
              ]}
            />
          </Section>

          <Section id="leave" title={t("leaveTitle")} actions={<Link href="/admin/leave" className={buttonVariants({ variant: "ghost", size: "sm" })}>{t("leaveOpen")}</Link>}>
            {e.leave.length ? (
              <ul className="grid gap-3">
                {e.leave.map((l) => (
                  <li key={l.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold">{l.name}</span>
                      <span className="tabular text-muted-foreground">{t("leaveLeft", { left: l.remaining, quota: l.quota })}</span>
                    </div>
                    <Progress value={l.used} max={Math.max(1, l.quota)} label={t("leaveUsed", { used: l.used, quota: l.quota })} tone={l.remaining <= 0 ? "red" : "brand"} />
                    {l.pending ? <p className="mt-1 text-[12px] text-warning">{t("leavePending", { n: l.pending })}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("leaveNone")}</p>
            )}
          </Section>

          <Section id="logins" title={t("loginsTitle")}>
            {e.logins.length ? (
              <ul className="divide-y divide-border">
                {e.logins.map((l) => (
                  <li key={l.id} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                    {l.success ? <LogIn className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />}
                    <div className="min-w-0 text-[13px]">
                      <p className="tabular font-semibold">
                        {formatInTz(l.at, tz)} <span className="sr-only">{l.success ? t("loginOk") : t("loginFailed")}</span>
                        {!l.success ? <span className="ml-1 font-normal text-danger">{t("loginFailedReason", { reason: l.reason ?? "—" })}</span> : null}
                      </p>
                      <p className="truncate text-muted-foreground" title={l.userAgent ?? undefined}>
                        {l.ip ?? "—"} · {l.userAgent ? l.userAgent.slice(0, 60) : "—"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("loginsNone")}</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
