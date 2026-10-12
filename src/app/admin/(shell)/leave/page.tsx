import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarDays, Inbox, Paperclip } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { requireRole } from "@/server/auth/guards";
import { coverCandidates, holidayRegionOptions, leaveCalendar, listHolidays, listLeaveTypes, listPending, listRecentDecisions } from "@/server/services/leave";
import { addDayKey, dayKey, keyFromDateOnly, weekdayOfKey } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CoverButton, DecideButtons, DeleteHolidayButton, HolidayForm, LeaveTypeDialog } from "./leave-admin-client";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.adminLeave");
  return { title: t("metaTitle") };
}

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const fmtKey = (k: string, p = "EEE d MMM") => formatInTz(new Date(`${k}T12:00:00Z`), "UTC", p);

/** /admin/leave — approvals (+ cover prompt), who's out calendar, holidays, leave types (SPEC F9). */
export default async function AdminLeavePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireRole(["MANAGER", "ADMIN"]);
  const sp = await searchParams;
  const t = await getTranslations("work.adminLeave");
  const tl = await getTranslations("leaveStatus");
  const tz = user.timezone;
  const today = dayKey(new Date(), tz);
  const range = sp.range === "month" ? "month" : "week";
  const monday = addDayKey(today, 1 - weekdayOfKey(today));
  const from = range === "week" ? monday : `${today.slice(0, 8)}01`;
  const [y, m] = today.split("-").map(Number);
  const nextMonth = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, "0")}-01`;
  const to = range === "week" ? addDayKey(monday, 6) : addDayKey(nextMonth, -1);
  const year = Number(today.slice(0, 4));

  const [pending, recent, cal, holidays, types, regions] = await Promise.all([listPending(), listRecentDecisions(15), leaveCalendar(from, to), listHolidays(year), listLeaveTypes(), holidayRegionOptions()]);
  const candidates = new Map<string, Awaited<ReturnType<typeof coverCandidates>>>();
  for (const id of [...pending.map((p) => p.id), ...recent.filter((r) => r.status === "APPROVED" && !r.coverEmployeeId && keyFromDateOnly(r.toDate) >= today).map((r) => r.id)]) {
    candidates.set(id, await coverCandidates(id));
  }
  const people = [...new Map(cal.leaves.map((l) => [l.employee.id, l.employee])).values()];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <section aria-labelledby="pending" className="mb-8">
        <h2 id="pending" className="mb-3 text-[19px] font-bold">{t("pending", { count: pending.length })}</h2>
        {pending.length === 0 ? (
          <EmptyState className="bg-surface" icon={<Inbox className="h-6 w-6" aria-hidden="true" />} title={t("noPending")} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{p.employee.user.name} <span className="text-sm font-medium text-muted-foreground">{p.employee.employeeCode}</span></p>
                    <p className="text-sm text-muted-foreground">
                      {p.leaveType.name} · {fmtKey(keyFromDateOnly(p.fromDate))}
                      {keyFromDateOnly(p.toDate) !== keyFromDateOnly(p.fromDate) ? ` → ${fmtKey(keyFromDateOnly(p.toDate))}` : ""}
                      {p.halfDay ? ` · ${p.halfDay === "FIRST" ? t("firstHalf") : t("secondHalf")}` : ""}
                    </p>
                  </div>
                  <Badge tone="amber">{t("days", { n: n(p.days) })}</Badge>
                </div>
                <p className="text-sm">{p.reason}</p>
                <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
                  {p.balance?.limited ? <div><dt className="inline">{t("balance")}: </dt><dd className="inline font-semibold text-foreground">{t("balanceValue", { left: n(p.balance.available), total: n(p.balance.entitled) })}</dd></div> : null}
                  <div><dt className="inline">{t("students")}: </dt><dd className="inline font-semibold text-foreground">{p.students}</dd></div>
                  <div><dt className="inline">{t("requested")}: </dt><dd className="inline">{formatInTz(p.createdAt, tz, "d MMM, h:mm a")}</dd></div>
                  {p.attachmentId ? <div><a href={`/api/files/${p.attachmentId}`} className="inline-flex items-center gap-1 font-semibold"><Paperclip className="h-3.5 w-3.5" aria-hidden="true" />{t("attachment")}</a></div> : null}
                </dl>
                {p.balance?.limited && p.days > p.balance.available ? <p role="status" className="text-[13px] font-semibold text-danger">{t("overBalance")}</p> : null}
                <DecideButtons id={p.id} employeeName={p.employee.user.name} students={p.students} candidates={candidates.get(p.id) ?? []} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cal" className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="cal" className="text-[19px] font-bold">{range === "week" ? t("whoOutWeek") : t("whoOutMonth")}</h2>
          <nav aria-label={t("rangeNav")} className="inline-flex rounded-[12px] bg-surface-muted p-1">
            {(["week", "month"] as const).map((r) => (
              <Link key={r} href={r === "week" ? "/admin/leave" : "/admin/leave?range=month"} aria-current={range === r ? "page" : undefined} className={cn("rounded-[10px] px-4 py-2 text-sm font-semibold", range === r ? "bg-surface shadow-sm" : "text-muted-foreground")}>{t(`range.${r}`)}</Link>
            ))}
          </nav>
        </div>
        {people.length === 0 && cal.holidays.length === 0 ? (
          <EmptyState className="bg-surface" icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />} title={t("nobodyOut")} />
        ) : (
          <TableWrap>
            <table className="w-full border-collapse text-sm" style={{ minWidth: 180 + cal.days.length * 40 }}>
              <caption className="sr-only">{t("calCaption", { from: fmtKey(from), to: fmtKey(to) })}</caption>
              <thead className="bg-surface-muted text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-surface-muted px-3 py-2 text-left font-semibold">{t("employee")}</th>
                  {cal.days.map((d) => (
                    <th key={d} scope="col" className={cn("px-1 py-2 text-center font-semibold", weekdayOfKey(d) >= 6 && "text-subtle-foreground/70", d === today && "text-primary")}>
                      <div>{fmtKey(d, "EEEEE")}</div>
                      <div className="tabular">{Number(d.slice(8))}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cal.holidays.length ? (
                  <tr className="border-t border-border">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold">{t("holidaysRow")}</th>
                    {cal.days.map((d) => {
                      const hs = cal.holidays.filter((h) => keyFromDateOnly(h.date) === d);
                      return <td key={d} className="px-1 py-1 text-center">{hs.length ? <span title={hs.map((h) => `${h.name} (${h.region})`).join(", ")} className="inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] bg-[#E1F6FD] px-1 text-[10px] font-bold text-[#0B6C8F]">{hs.map((h) => h.region).join("/")}</span> : null}</td>;
                    })}
                  </tr>
                ) : null}
                {people.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium">{e.user.name}</th>
                    {cal.days.map((d) => {
                      const l = cal.leaves.find((x) => x.employee.id === e.id && keyFromDateOnly(x.fromDate) <= d && keyFromDateOnly(x.toDate) >= d);
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          {l ? (
                            <span title={`${l.leaveType.name} · ${tl(l.status)}`} className={cn("inline-flex h-7 w-full min-w-7 items-center justify-center rounded-[6px] text-[10px] font-bold", l.status === "APPROVED" ? "bg-[#F0EAFE] text-[#5B2BC4]" : "border border-dashed border-[#B7791F] text-[#7A4E0E]")}>
                              {l.halfDay ? "½" : l.leaveType.name.slice(0, 2)}
                              <span className="sr-only"> {l.leaveType.name}, {tl(l.status)}</span>
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t("legend")}</p>
      </section>

      <section aria-labelledby="decided" className="mb-8">
        <h2 id="decided" className="mb-3 text-[19px] font-bold">{t("recent")}</h2>
        {recent.length === 0 ? <p className="text-sm text-muted-foreground">{t("noRecent")}</p> : (
          <TableWrap>
            <Table className="min-w-[760px]">
              <THead><tr><TH>{t("employee")}</TH><TH>{t("col.dates")}</TH><TH>{t("col.type")}</TH><TH>{t("col.status")}</TH><TH>{t("col.note")}</TH><TH><span className="sr-only">{t("col.cover")}</span></TH></tr></THead>
              <tbody>
                {recent.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.employee.user.name}</TD>
                    <TD className="whitespace-nowrap">{fmtKey(keyFromDateOnly(r.fromDate))}{keyFromDateOnly(r.toDate) !== keyFromDateOnly(r.fromDate) ? ` → ${fmtKey(keyFromDateOnly(r.toDate))}` : ""}</TD>
                    <TD>{r.leaveType.name} · {n(r.days)}</TD>
                    <TD><Badge tone={r.status === "APPROVED" ? "green" : "red"}>{tl(r.status)}</Badge></TD>
                    <TD className="max-w-[260px] truncate text-muted-foreground">{r.decisionNote ?? ""}</TD>
                    <TD className="text-right">{candidates.has(r.id) ? <CoverButton id={r.id} candidates={candidates.get(r.id)!} /> : r.coverEmployeeId ? <span className="text-xs font-semibold text-success">{t("coverSet")}</span> : null}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>{t("holidays.title", { year })}</CardTitle><CardDescription>{t("holidays.description")}</CardDescription></div>
          </CardHeader>
          <CardContent className="grid gap-4">
            <HolidayForm regions={regions} year={year} />
            {holidays.length === 0 ? <p className="text-sm text-muted-foreground">{t("holidays.empty")}</p> : (
              <ul className="divide-y divide-border">
                {holidays.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-[110px] shrink-0 tabular">{fmtKey(keyFromDateOnly(h.date), "EEE d MMM")}</span>
                    <span className="flex-1 font-medium">{h.name}</span>
                    <Badge tone="cyan">{h.region}</Badge>
                    <DeleteHolidayButton id={h.id} name={h.name} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div><CardTitle>{t("types.title")}</CardTitle><CardDescription>{t("types.description")}</CardDescription></div>
            <LeaveTypeDialog />
          </CardHeader>
          <CardContent>
            <TableWrap className="border-0">
              <Table className="min-w-[480px]">
                <THead><tr><TH>{t("types.name")}</TH><TH>{t("types.quota")}</TH><TH>{t("types.paid")}</TH><TH>{t("types.carry")}</TH><TH><span className="sr-only">{t("types.edit")}</span></TH></tr></THead>
                <tbody>
                  {types.map((lt) => (
                    <TR key={lt.id} className={cn(!lt.isActive && "opacity-60")}>
                      <TD className="font-medium">{lt.name}{!lt.isActive ? <span className="ml-2 text-xs text-muted-foreground">{t("types.inactive")}</span> : null}</TD>
                      <TD className="tabular">{lt.annualQuota > 0 ? n(lt.annualQuota) : t("types.unlimited")}</TD>
                      <TD>{lt.paid ? t("types.yes") : t("types.no")}</TD>
                      <TD>{lt.carryForward ? t("types.yes") : t("types.no")}</TD>
                      <TD className="text-right"><LeaveTypeDialog type={lt} /></TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
