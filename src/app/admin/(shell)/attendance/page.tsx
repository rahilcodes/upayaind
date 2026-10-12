import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, Search } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { AutoRefresh } from "@/components/attendance/auto-refresh";
import { AttendancePill, hm } from "@/components/attendance/status";
import { requireRole } from "@/server/auth/guards";
import { getAttendanceBoard, getTimesheetRange, listSessions, type BoardState } from "@/server/services/attendance";
import { addDayKey, dayKey, startOfDayInTz } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DayDialog, SessionDialog } from "./correction-dialogs";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.adminAttendance");
  return { title: t("metaTitle") };
}

const STATE_STYLE: Record<BoardState, { dot: string; pill: string }> = {
  active: { dot: "bg-success", pill: "bg-[#E6F4EC] text-[#1E7B4F]" },
  idle: { dot: "bg-warning", pill: "bg-[#FDF3E1] text-[#7A4E0E]" },
  break: { dot: "bg-blue", pill: "bg-[#EAF1FE] text-[#2563DE]" },
  notIn: { dot: "bg-danger", pill: "bg-[#FCEAE8] text-[#A82A21]" },
  leave: { dot: "bg-[#5B2BC4]", pill: "bg-[#F0EAFE] text-[#5B2BC4]" },
  out: { dot: "bg-[#8A93AD]", pill: "bg-[#EEF0F5] text-[#4A5578]" },
  off: { dot: "bg-[#B5BCCD]", pill: "bg-[#EEF0F5] text-[#4A5578]" },
};
const ORDER: BoardState[] = ["active", "idle", "break", "notIn", "leave", "out", "off"];
const key = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** /admin/attendance — today's board, date-range timesheets, exports, corrections (SPEC F8). */
export default async function AdminAttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireRole(["MANAGER", "ADMIN"]);
  const sp = await searchParams;
  const t = await getTranslations("work.adminAttendance");
  const tz = user.timezone;
  const now = new Date();
  const today = dayKey(now, tz);
  let from = key(sp.from) ?? addDayKey(today, -6);
  let to = key(sp.to) ?? today;
  if (to < from) [from, to] = [to, from];
  if (addDayKey(from, 92) < to) from = addDayKey(to, -92);
  const employeeId = sp.employee || null;

  const [board, range] = await Promise.all([getAttendanceBoard(now), getTimesheetRange({ from, to, employeeId }, now)]);
  const selected = employeeId ? range.employees.find((e) => e.id === employeeId) : null;
  const selTz = selected ? board.rows.find((r) => r.id === selected.id)?.timezone ?? tz : tz;
  const sessions = selected ? await listSessions(selected.id, startOfDayInTz(from, selTz), startOfDayInTz(addDayKey(to, 1), selTz)) : [];
  const qs = new URLSearchParams({ from, to, ...(employeeId ? { employee: employeeId } : {}) });
  const rows = [...board.rows].sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
  const tmIn = (d: Date | null, z: string) => (d ? formatInTz(d, z, "h:mm a") : "—");

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader title={t("title")} description={t("description")} />

      <section aria-labelledby="board" className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="board" className="text-[19px] font-bold">{t("board")}</h2>
          <p className="text-xs text-muted-foreground">{t("updated", { time: formatInTz(now, tz, "h:mm a") })}</p>
        </div>
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label={t("summary")}>
          {(["active", "idle", "break", "notIn", "leave", "out"] as BoardState[]).map((s) => (
            <li key={s} className="rounded-[14px] border border-border bg-surface px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground"><span aria-hidden="true" className={cn("h-2 w-2 rounded-full", STATE_STYLE[s].dot)} />{t(`state.${s}`)}</p>
              <p className="mt-0.5 text-2xl font-bold tabular">{board.counts[s]}</p>
            </li>
          ))}
        </ul>
        <TableWrap>
          <Table className="min-w-[900px]">
            <caption className="sr-only">{t("boardCaption")}</caption>
            <THead><tr><TH>{t("col.employee")}</TH><TH>{t("col.state")}</TH><TH>{t("col.firstLogin")}</TH><TH>{t("col.clockIn")}</TH><TH>{t("col.clocked")}</TH><TH>{t("col.active")}</TH><TH>{t("col.lastActivity")}</TH><TH>{t("col.apps")}</TH></tr></THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/admin/attendance?${new URLSearchParams({ from, to, employee: r.id })}#range`} className="font-semibold text-foreground hover:underline">{r.name}</Link>
                    <p className="text-xs text-muted-foreground">{r.code} · {r.timezone}</p>
                  </TD>
                  <TD>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", STATE_STYLE[r.state].pill)}>
                      <span aria-hidden="true" className={cn("h-[7px] w-[7px] rounded-full", STATE_STYLE[r.state].dot)} />
                      {t(`state.${r.state}`)}
                    </span>
                    {r.day.holiday ? <p className="mt-0.5 text-xs text-muted-foreground">{r.day.holiday}</p> : null}
                  </TD>
                  <TD className="tabular">{tmIn(r.day.firstLoginAt, r.timezone)}</TD>
                  <TD className="tabular">{tmIn(r.day.clockInAt, r.timezone)}</TD>
                  <TD className="font-semibold tabular">{hm(r.day.clockedMinutes)}</TD>
                  <TD className="tabular">{hm(r.day.activeMinutes)}</TD>
                  <TD className="tabular">{r.day.lastActivityAt ? t("ago", { min: Math.max(0, Math.round((now.getTime() - r.day.lastActivityAt.getTime()) / 60000)) }) : "—"}</TD>
                  <TD className="tabular">{r.day.applications}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
        <p className="mt-2 text-xs text-muted-foreground">{t("boardLegend")}</p>
      </section>

      <section aria-labelledby="range" id="range">
        <h2 id="range-h" className="mb-3 text-[19px] font-bold">{t("timesheets")}</h2>
        <form method="get" className="mb-4 grid grid-cols-2 gap-3 rounded-[18px] border border-border bg-surface p-4 lg:grid-cols-[1fr_1fr_2fr_auto_auto] lg:items-end">
          <Field id="from" label={t("from")}><Input id="from" name="from" type="date" defaultValue={from} max={today} /></Field>
          <Field id="to" label={t("to")}><Input id="to" name="to" type="date" defaultValue={to} max={today} /></Field>
          <Field id="employee" label={t("employee")} className="col-span-2 lg:col-span-1">
            <Select id="employee" name="employee" defaultValue={employeeId ?? ""}>
              <option value="">{t("allEmployees")}</option>
              {range.employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
            </Select>
          </Field>
          <Button type="submit"><Search className="h-4 w-4" aria-hidden="true" />{t("show")}</Button>
          <div className="flex gap-2">
            <a href={`/admin/attendance/export?${qs}&format=csv`} className={buttonVariants({ variant: "outline" })} download><Download className="h-4 w-4" aria-hidden="true" />CSV</a>
            <a href={`/admin/attendance/export?${qs}&format=xlsx`} className={buttonVariants({ variant: "outline" })} download><Download className="h-4 w-4" aria-hidden="true" />XLSX</a>
          </div>
        </form>

        {range.totals.length ? (
          <div className="mb-4">
            <TableWrap>
              <Table className="min-w-[760px]">
                <caption className="sr-only">{t("totalsCaption")}</caption>
                <THead><tr><TH>{t("col.employee")}</TH><TH>{t("col.clocked")}</TH><TH>{t("col.active")}</TH><TH>{t("col.present")}</TH><TH>{t("col.half")}</TH><TH>{t("col.absent")}</TH><TH>{t("col.leave")}</TH><TH>{t("col.apps")}</TH></tr></THead>
                <tbody>
                  {range.totals.map((r) => (
                    <TR key={r.id}>
                      <TD><Link href={`/admin/attendance?${new URLSearchParams({ from, to, employee: r.id })}#range`} className="font-semibold text-foreground hover:underline">{r.name}</Link></TD>
                      <TD className="font-semibold tabular">{hm(r.clockedMinutes)}</TD>
                      <TD className="tabular">{hm(r.activeMinutes)}</TD>
                      <TD className="tabular">{r.present}</TD>
                      <TD className="tabular">{r.halfDays}</TD>
                      <TD className={cn("tabular", r.absent && "font-semibold text-danger")}>{r.absent}</TD>
                      <TD className="tabular">{r.leave}</TD>
                      <TD className="tabular">{r.applications}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        ) : null}

        {selected ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <h3 className="mb-2 font-bold">{t("daysOf", { name: selected.name })}</h3>
              {range.rows.length === 0 ? <EmptyState className="bg-surface" title={t("noDays")} /> : (
                <TableWrap>
                  <Table className="min-w-[600px]">
                    <THead><tr><TH>{t("col.date")}</TH><TH>{t("col.status")}</TH><TH>{t("col.clockIn")}</TH><TH>{t("col.clockOut")}</TH><TH>{t("col.clocked")}</TH><TH><span className="sr-only">{t("correct.action")}</span></TH></tr></THead>
                    <tbody>
                      {range.rows.map((r) => (
                        <TR key={`${r.employeeId}-${r.date}`}>
                          <TD className="whitespace-nowrap">{formatInTz(new Date(`${r.date}T12:00:00Z`), "UTC", "EEE d MMM")}</TD>
                          <TD><AttendancePill status={r.status} /></TD>
                          <TD className="tabular">{tmIn(r.clockInAt, r.timezone)}</TD>
                          <TD className="tabular">{tmIn(r.clockOutAt, r.timezone)}</TD>
                          <TD className="font-semibold tabular">{hm(r.clockedMinutes)}</TD>
                          <TD className="text-right">{!r.live ? <DayDialog employeeId={r.employeeId} employeeName={r.name} date={r.date} status={r.status} /> : null}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-bold">{t("sessionsOf", { name: selected.name })}</h3>
                <SessionDialog employeeId={selected.id} employeeName={selected.name} tz={selTz} />
              </div>
              {sessions.length === 0 ? <EmptyState className="bg-surface" title={t("noSessions")} /> : (
                <TableWrap>
                  <Table className="min-w-[560px]">
                    <THead><tr><TH>{t("col.date")}</TH><TH>{t("col.clockIn")}</TH><TH>{t("col.clockOut")}</TH><TH>{t("col.breaks")}</TH><TH>{t("col.note")}</TH><TH><span className="sr-only">{t("correct.action")}</span></TH></tr></THead>
                    <tbody>
                      {sessions.map((s) => (
                        <TR key={s.id}>
                          <TD className="whitespace-nowrap">{formatInTz(s.startedAt, selTz, "EEE d MMM")}</TD>
                          <TD className="tabular">{tmIn(s.startedAt, selTz)}</TD>
                          <TD className="tabular">{s.endedAt ? tmIn(s.endedAt, selTz) : t("open")}</TD>
                          <TD className="tabular">{s.breaks.length}</TD>
                          <TD className="max-w-[200px] truncate text-xs text-muted-foreground" title={s.correctionNote ?? undefined}>{s.autoClosed ? t("autoClosed") : s.correctionNote ?? ""}</TD>
                          <TD className="text-right"><SessionDialog session={{ id: s.id, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString() ?? null }} employeeId={selected.id} employeeName={selected.name} tz={selTz} /></TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("pickEmployee")}</p>
        )}
      </section>
    </>
  );
}
