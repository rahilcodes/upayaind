import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Paperclip, Plane } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { requireStaff } from "@/server/auth/guards";
import { myLeave } from "@/server/services/leave";
import { addDayKey, dayKey, keyFromDateOnly } from "@/lib/dates";
import { formatInTz } from "@/lib/format";
import { CancelLeaveButton, LeaveForm } from "./leave-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.leave");
  return { title: t("metaTitle") };
}

const STATUS_TONE = { PENDING: "amber", APPROVED: "green", REJECTED: "red", CANCELLED: "slate" } as const;
const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** /work/leave — balances, apply, history (SPEC F9). */
export default async function LeavePage() {
  const { user, employee } = await requireStaff();
  const t = await getTranslations("work.leave");
  const tc = await getTranslations("work.common");
  const tl = await getTranslations("leaveStatus");
  if (!employee || user.role === "ADMIN") {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState className="bg-surface" title={tc("noProfileTitle")} body={t("noLeaveForRole")} />
      </>
    );
  }
  const data = await myLeave(user);
  const tz = data.timezone;
  const fmtDay = (d: Date) => formatInTz(new Date(`${keyFromDateOnly(d)}T12:00:00Z`), "UTC", "EEE d MMM yyyy");
  const minDate = addDayKey(dayKey(new Date(), tz), -30);

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { year: data.year })} />
      <section aria-label={t("balances")} className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.balances.map((b) => (
          <div key={b.type.id} className="rounded-[16px] border border-border bg-surface px-5 py-[18px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">{b.type.name}</p>
              {!b.type.paid ? <Badge tone="grey">{t("unpaid")}</Badge> : null}
            </div>
            {b.limited ? (
              <>
                <p className="mt-1 text-[30px] font-bold tabular">
                  {n(b.remaining)} <span className="text-base font-medium text-muted-foreground">{t("of", { total: n(b.entitled) })}</span>
                </p>
                <Progress className="mt-2" value={b.used} max={Math.max(1, b.entitled)} tone={b.remaining <= 1 ? "amber" : "brand"} label={t("usedLabel", { used: n(b.used), total: n(b.entitled), type: b.type.name })} />
                <p className="mt-1.5 text-[13px] text-muted-foreground">
                  {t("usedPending", { used: n(b.used), pending: n(b.pending) })}
                  {b.carried ? ` · ${t("carried", { days: n(b.carried) })}` : b.type.carryForward ? ` · ${t("carries")}` : ""}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-[30px] font-bold tabular">{n(b.used)}</p>
                <p className="mt-1.5 text-[13px] text-muted-foreground">{t("noQuota", { pending: n(b.pending) })}</p>
              </>
            )}
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <Card className="self-start">
          <CardHeader><CardTitle>{t("apply")}</CardTitle></CardHeader>
          <CardContent>
            <LeaveForm minDate={minDate} types={data.balances.map((b) => ({ id: b.type.id, name: b.type.name, available: b.limited ? b.available : null }))} />
          </CardContent>
        </Card>
        <section aria-labelledby="hist">
          <h2 id="hist" className="mb-3 text-[19px] font-bold">{t("history")}</h2>
          {data.history.length === 0 ? (
            <EmptyState className="bg-surface" icon={<Plane className="h-6 w-6" aria-hidden="true" />} title={t("emptyTitle")} body={t("emptyBody")} />
          ) : (
            <TableWrap>
              <Table className="min-w-[760px]">
                <caption className="sr-only">{t("history")}</caption>
                <THead>
                  <tr>
                    <TH>{t("col.dates")}</TH>
                    <TH>{t("col.type")}</TH>
                    <TH>{t("col.days")}</TH>
                    <TH>{t("col.reason")}</TH>
                    <TH>{t("col.status")}</TH>
                    <TH><span className="sr-only">{t("col.actions")}</span></TH>
                  </tr>
                </THead>
                <tbody>
                  {data.history.map((h) => (
                    <TR key={h.id}>
                      <TD className="whitespace-nowrap">
                        {fmtDay(h.fromDate)}
                        {keyFromDateOnly(h.toDate) !== keyFromDateOnly(h.fromDate) ? ` → ${fmtDay(h.toDate)}` : ""}
                        {h.halfDay ? <span className="block text-xs text-muted-foreground">{h.halfDay === "FIRST" ? t("firstHalf") : t("secondHalf")}</span> : null}
                      </TD>
                      <TD>{h.leaveType.name}</TD>
                      <TD className="tabular">{n(h.days)}</TD>
                      <TD className="max-w-[280px]">
                        <p className="line-clamp-2">{h.reason}</p>
                        {h.attachmentId ? <a href={`/api/files/${h.attachmentId}`} className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold"><Paperclip className="h-3 w-3" aria-hidden="true" />{t("attachment")}</a> : null}
                        {h.decisionNote ? <p className="mt-1 text-xs text-muted-foreground">{t("managerNote", { note: h.decisionNote })}</p> : null}
                        {h.status === "APPROVED" ? <p className="mt-1 text-xs text-muted-foreground">{h.covers.length ? t("coveredBy", { list: h.covers.map((c) => `${c.name} (${c.count})`).join(", ") }) : t("noCoverYet")}</p> : null}
                      </TD>
                      <TD>
                        <Badge tone={STATUS_TONE[h.status]}>{tl(h.status)}</Badge>
                        {h.decidedAt ? <span className="mt-0.5 block text-xs text-muted-foreground">{formatInTz(h.decidedAt, tz, "d MMM")}</span> : null}
                      </TD>
                      <TD className="text-right">{h.status === "PENDING" ? <CancelLeaveButton id={h.id} label={t("cancelLabel", { from: fmtDay(h.fromDate) })} /> : null}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </section>
      </div>
    </>
  );
}
