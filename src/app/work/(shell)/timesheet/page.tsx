import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { AttendancePill, hm } from "@/components/attendance/status";
import { requireStaff } from "@/server/auth/guards";
import { getMyTimesheet, isMonthKey } from "@/server/services/attendance";
import { dayKey, weekdayOfKey } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.timesheet");
  return { title: t("metaTitle") };
}

function shiftMonth(m: string, d: number) {
  const [y, mo] = m.split("-").map(Number);
  const idx = y! * 12 + (mo! - 1) + d;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** /work/timesheet — calendar + list, week/month totals, sessions and login history (F8). */
export default async function TimesheetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, employee } = await requireStaff();
  const sp = await searchParams;
  const t = await getTranslations("work.timesheet");
  const tc = await getTranslations("work.common");
  if (!employee) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState className="bg-surface" title={tc("noProfileTitle")} body={tc("noProfileBody")} />
      </>
    );
  }
  const tz = user.timezone;
  const thisMonth = dayKey(new Date(), tz).slice(0, 7);
  const month = isMonthKey(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const view = sp.view === "list" ? "list" : "calendar";
  const data = await getMyTimesheet(user, month);
  const monthLabel = formatInTz(new Date(`${month}-15T12:00:00Z`), "UTC", "MMMM yyyy");
  const lead = weekdayOfKey(data.first) - 1;
  const tm = (d: Date | null) => (d ? formatInTz(d, tz, "h:mm a") : "—");
  const qs = (patch: Record<string, string>) => `/work/timesheet?${new URLSearchParams({ month, view, ...patch })}`;
  const weekdays = [1, 2, 3, 4, 5, 6, 7].map((i) => formatInTz(new Date(Date.UTC(2026, 0, 4 + i, 12)), "UTC", "EEE"));

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { tz })} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={qs({ month: shiftMonth(month, -1) })} className={buttonVariants({ variant: "outline", size: "icon-sm" })} aria-label={t("prev")}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Link>
          <h2 className="min-w-[150px] text-center text-lg font-bold" aria-live="polite">{monthLabel}</h2>
          {month < thisMonth ? (
            <Link href={qs({ month: shiftMonth(month, 1) })} className={buttonVariants({ variant: "outline", size: "icon-sm" })} aria-label={t("next")}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
          ) : <span className="h-9 w-9" />}
        </div>
        <nav aria-label={t("viewNav")} className="inline-flex rounded-[12px] bg-surface-muted p-1">
          {(["calendar", "list"] as const).map((v) => (
            <Link key={v} href={qs({ view: v })} aria-current={view === v ? "page" : undefined} className={cn("rounded-[10px] px-4 py-2 text-sm font-semibold", view === v ? "bg-surface shadow-sm" : "text-muted-foreground")}>{t(`view.${v}`)}</Link>
          ))}
        </nav>
      </div>

      <section aria-label={t("totals")} className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          [t("tot.clocked"), hm(data.total.clockedMinutes)],
          [t("tot.active"), hm(data.total.activeMinutes)],
          [t("tot.present"), `${(data.total.counts.PRESENT ?? 0) + (data.total.counts.HALF_DAY ?? 0) * 0.5}`],
          [t("tot.applications"), String(data.total.applications)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-[16px] border border-border bg-surface px-5 py-4">
            <p className="text-sm font-medium text-muted-foreground">{l}</p>
            <p className="mt-1 text-[26px] font-bold tabular">{v}</p>
          </div>
        ))}
      </section>

      {view === "calendar" ? (
        <div tabIndex={0} role="region" aria-label="Calendar" className="mb-6 overflow-x-auto rounded-[18px] border border-border bg-surface p-3 sm:p-4">
          <div className="grid min-w-[640px] grid-cols-[repeat(7,minmax(0,1fr))_110px] gap-2">
            {weekdays.map((w) => <div key={w} className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{w}</div>)}
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("week")}</div>
            {(() => {
              const cells: React.ReactNode[] = [];
              for (let i = 0; i < lead; i++) cells.push(<div key={`e${i}`} aria-hidden="true" />);
              let wi = 0;
              data.days.forEach((d, i) => {
                const wd = weekdayOfKey(d.key);
                cells.push(
                  <div key={d.key} className={cn("min-h-[92px] rounded-[12px] border p-2", d.today ? "border-primary" : "border-border", d.future && "border-dashed bg-surface-muted/40")}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-bold tabular">{Number(d.key.slice(8))}</span>
                      {d.status || d.today ? <AttendancePill status={d.status} /> : null}
                    </div>
                    {d.clockedMinutes || d.today ? (
                      <p className="mt-1.5 text-[13px] font-semibold tabular">{hm(d.clockedMinutes)}</p>
                    ) : null}
                    {d.activeMinutes ? <p className="text-[11px] text-muted-foreground tabular">{t("activeShort", { v: hm(d.activeMinutes) })}</p> : null}
                    {d.holiday ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={d.holiday}>{d.holiday}</p> : null}
                  </div>,
                );
                if (wd === 7 || i === data.days.length - 1) {
                  if (wd !== 7) for (let k = wd; k < 7; k++) cells.push(<div key={`p${k}`} aria-hidden="true" />);
                  const w = data.weeks[wi++];
                  cells.push(
                    <div key={`w${d.key}`} className="flex flex-col justify-center rounded-[12px] bg-surface-muted p-2 text-[13px]">
                      <span className="font-bold tabular">{w ? hm(w.clockedMinutes) : ""}</span>
                      <span className="text-[11px] text-muted-foreground">{w ? t("daysWorked", { n: w.daysPresent }) : ""}</span>
                    </div>,
                  );
                }
              });
              return cells;
            })()}
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <TableWrap>
            <Table className="min-w-[860px]">
              <caption className="sr-only">{t("listCaption", { month: monthLabel })}</caption>
              <THead>
                <tr>
                  <TH>{t("col.date")}</TH><TH>{t("col.status")}</TH><TH>{t("col.in")}</TH><TH>{t("col.out")}</TH><TH>{t("col.clocked")}</TH><TH>{t("col.break")}</TH><TH>{t("col.active")}</TH><TH>{t("col.apps")}</TH>
                </tr>
              </THead>
              <tbody>
                {[...data.days].reverse().filter((d) => !d.future).map((d) => (
                  <TR key={d.key} className={cn(d.today && "bg-accent/50")}>
                    <TD className="whitespace-nowrap font-medium">{formatInTz(new Date(`${d.key}T12:00:00Z`), "UTC", "EEE d MMM")}{d.holiday ? <span className="block text-xs text-muted-foreground">{d.holiday}</span> : null}</TD>
                    <TD><AttendancePill status={d.status} /></TD>
                    <TD className="tabular">{tm(d.clockInAt)}</TD>
                    <TD className="tabular">{d.today && !d.clockOutAt && d.clockInAt ? t("ongoing") : tm(d.clockOutAt)}</TD>
                    <TD className="font-semibold tabular">{hm(d.clockedMinutes)}</TD>
                    <TD className="tabular">{hm(d.breakMinutes)}</TD>
                    <TD className="tabular">{hm(d.activeMinutes)}</TD>
                    <TD className="tabular">{d.applications}</TD>
                  </TR>
                ))}
                {data.weeks.map((w) => (
                  <TR key={`wk${w.from}`} className="bg-surface-muted text-sm">
                    <TD colSpan={4} className="font-semibold">{t("weekOf", { from: formatInTz(new Date(`${w.from}T12:00:00Z`), "UTC", "d MMM"), to: formatInTz(new Date(`${w.to}T12:00:00Z`), "UTC", "d MMM") })}</TD>
                    <TD className="font-bold tabular">{hm(w.clockedMinutes)}</TD>
                    <TD />
                    <TD className="tabular">{hm(w.activeMinutes)}</TD>
                    <TD className="text-muted-foreground">{t("daysWorked", { n: w.daysPresent })}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="sess">
          <h2 id="sess" className="mb-3 text-[19px] font-bold">{t("sessions")}</h2>
          {data.sessions.length === 0 ? (
            <EmptyState className="bg-surface" icon={<Clock className="h-6 w-6" aria-hidden="true" />} title={t("noSessions")} />
          ) : (
            <TableWrap>
              <Table className="min-w-[520px]">
                <THead><tr><TH>{t("col.date")}</TH><TH>{t("col.in")}</TH><TH>{t("col.out")}</TH><TH>{t("col.breaks")}</TH><TH>{t("col.note")}</TH></tr></THead>
                <tbody>
                  {data.sessions.slice(0, 40).map((s) => (
                    <TR key={s.id}>
                      <TD className="whitespace-nowrap">{formatInTz(s.startedAt, tz, "EEE d MMM")}</TD>
                      <TD className="tabular">{tm(s.startedAt)}</TD>
                      <TD className="tabular">{s.endedAt ? tm(s.endedAt) : t("ongoing")}</TD>
                      <TD className="tabular">{s.breaks.length}</TD>
                      <TD className="text-xs text-muted-foreground">{s.autoClosed ? t("autoClosed") : s.correctionNote ? t("corrected", { note: s.correctionNote }) : ""}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </section>
        <section aria-labelledby="logins">
          <h2 id="logins" className="mb-3 text-[19px] font-bold">{t("logins")}</h2>
          <TableWrap>
            <Table className="min-w-[520px]">
              <THead><tr><TH>{t("col.when")}</TH><TH>{t("col.result")}</TH><TH>{t("col.ip")}</TH><TH>{t("col.device")}</TH></tr></THead>
              <tbody>
                {data.logins.map((l) => (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap tabular">{formatInTz(l.at, tz, "d MMM, h:mm a")}</TD>
                    <TD className="whitespace-nowrap">{l.success ? <span className="font-semibold text-success">{t("success")}</span> : <span className="font-semibold text-danger">{t("failed")}</span>}</TD>
                    <TD className="tabular text-muted-foreground">{l.ip ?? "—"}</TD>
                    <TD className="max-w-[220px] truncate text-xs text-muted-foreground" title={l.userAgent ?? undefined}>{l.userAgent ?? "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </section>
      </div>
    </>
  );
}
