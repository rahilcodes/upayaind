import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, CalendarClock, CreditCard, Download, FileText, Info } from "lucide-react";
import { PageHeader } from "@/components/portal/portal-shell";
import { PaymentStatusPill, SubscriptionStatusPill } from "@/components/billing/status-pills";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { requireStudent } from "@/server/auth/guards";
import { getStudentBilling } from "@/server/services/billing";
import { formatDate, formatMoney } from "@/lib/format";
import { PortalButton } from "./portal-button";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

function Alert({ tone, children }: { tone: "warning" | "danger" | "info"; children: React.ReactNode }) {
  const cls = {
    warning: "border-[#F0D9AE] bg-[#FDF3E1] text-[#5E3C08]",
    danger: "border-[#F3C8C3] bg-[#FCEAE8] text-[#8E231B]",
    info: "border-[#C6D9FC] bg-[#EAF1FE] text-[#1A4FB8]",
  }[tone];
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-[12px] border px-4 py-3 text-sm ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export default async function BillingPage() {
  const { user, student } = await requireStudent();
  const t = await getTranslations("billing.page");
  const tc = await getTranslations();
  const b = await getStudentBilling(student.id);
  const tz = user.timezone;
  const c = b.current;
  const live = c && (c.status === "ACTIVE" || c.status === "PAST_DUE" || c.status === "PAUSED");
  const renewHref = b.renewPlanPriceId ? `/app/checkout?plan=${b.renewPlanPriceId}` : "/pricing";

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-6">
        {b.pending && !live ? (
          <Alert tone="warning">
            <p>{t("pendingNotice", { plan: b.pending.planName })}</p>
            <Link href={`/app/checkout?plan=${b.pending.planPriceId}`} className="mt-1 inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
              {t("completePayment")}
            </Link>
          </Alert>
        ) : null}

        {c ? (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">{t("currentPlan")}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2.5">
                  <h2 className="text-[22px] font-bold leading-tight">{c.planName}</h2>
                  <SubscriptionStatusPill status={c.status} />
                </div>
                <p className="mt-1 text-[15px] text-muted-foreground">{t("perDay", { count: c.dailyTarget })}</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {live && c.canManage ? <PortalButton label={t("manage")} variant={c.status === "PAST_DUE" ? "primary" : "outline"} className="w-full sm:w-auto" /> : null}
                {!live ? (
                  <Link href={renewHref} className={buttonVariants({ className: "w-full sm:w-auto" })}>
                    {b.renewPlanPriceId ? t("renew") : t("choosePlan")}
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-1 border-t border-border sm:grid-cols-3">
              <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:border-b-0 sm:border-r sm:px-6">
                <CreditCard className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-[13px] text-muted-foreground">{t("price")}</p>
                  <p className="tabular font-semibold">
                    {formatMoney(c.amountMinor, c.currency, b.locale)} <span className="font-normal text-muted-foreground">{tc(`intervalPer.${c.interval}`)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 border-b border-border px-5 py-4 sm:border-b-0 sm:border-r sm:px-6">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-[13px] text-muted-foreground">{t("interval")}</p>
                  <p className="font-semibold">{tc(`interval.${c.interval}`)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-4 sm:px-6">
                <CalendarClock className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <p className="text-[13px] text-muted-foreground">
                    {!live ? t("endedOn") : c.cancelAtPeriodEnd || c.interval === "ONE_TIME" || !c.canManage ? t("endsOn") : t("renewsOn")}
                  </p>
                  <p className="tabular font-semibold">{c.currentPeriodEnd ? formatDate(c.currentPeriodEnd, tz) : "—"}</p>
                </div>
              </div>
            </div>
            {(() => {
              const notices: React.ReactNode[] = [];
              if (c.status === "PAST_DUE") notices.push(<Alert key="pd" tone="danger">{t("pastDueNotice")}</Alert>);
              if (live && c.cancelAtPeriodEnd && c.currentPeriodEnd) notices.push(<Alert key="cx" tone="warning">{t("cancelNotice", { date: formatDate(c.currentPeriodEnd, tz) })}</Alert>);
              if (live && c.interval === "ONE_TIME" && c.currentPeriodEnd) notices.push(<Alert key="ot" tone="info">{t("oneTimeNotice", { date: formatDate(c.currentPeriodEnd, tz) })}</Alert>);
              if (!live) notices.push(<Alert key="in" tone="info">{t("inactiveNotice")}</Alert>);
              return notices.length ? <div className="grid gap-2.5 border-t border-border p-4 sm:px-6">{notices}</div> : null;
            })()}
            {live && c.canManage ? <p className="border-t border-border px-5 py-3 text-[13px] text-muted-foreground sm:px-6">{t("manageHint")}</p> : null}
          </Card>
        ) : (
          <EmptyState
            icon={<CreditCard className="h-6 w-6" aria-hidden="true" />}
            title={t("noPlanTitle")}
            body={t("noPlanBody")}
            action={
              <Link href={b.pending ? `/app/checkout?plan=${b.pending.planPriceId}` : "/pricing"} className={buttonVariants({ className: "mt-2" })}>
                {b.pending ? t("completePayment") : t("choosePlan")}
              </Link>
            }
            className="bg-surface"
          />
        )}

        <section aria-labelledby="invoices-heading">
          <h2 id="invoices-heading" className="mb-3 text-[17px] font-bold">
            {t("invoices")}
          </h2>
          {b.invoices.length === 0 ? (
            <EmptyState icon={<FileText className="h-6 w-6" aria-hidden="true" />} title={t("invoicesEmpty")} body={t("invoicesEmptyBody")} className="bg-surface" />
          ) : (
            <>
              {/* Mobile: cards */}
              <ul className="grid gap-3 sm:hidden">
                {b.invoices.map((inv) => (
                  <li key={inv.id} className="rounded-[16px] border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{inv.invoiceNumber ?? "—"}</p>
                        <p className="text-[13px] text-muted-foreground">{formatDate(inv.date, tz)}</p>
                      </div>
                      <PaymentStatusPill status={inv.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="tabular text-[17px] font-bold">{formatMoney(inv.amountMinor, inv.currency, b.locale)}</p>
                      {inv.fileId ? (
                        <a href={`/api/files/${inv.fileId}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label={t("downloadLabel", { number: inv.invoiceNumber ?? "" })}>
                          <Download className="h-4 w-4" aria-hidden="true" />
                          {t("download")}
                        </a>
                      ) : null}
                    </div>
                    {inv.refundedMinor > 0 ? <p className="mt-2 text-[13px] text-muted-foreground">{t("refunded", { amount: formatMoney(inv.refundedMinor, inv.currency, b.locale) })}</p> : null}
                    {inv.status === "FAILED" && inv.failureReason ? <p className="mt-2 text-[13px] text-danger">{t("failedReason", { reason: inv.failureReason })}</p> : null}
                  </li>
                ))}
              </ul>
              {/* Tablet/desktop: table */}
              <TableWrap className="hidden sm:block">
                <Table className="min-w-0">
                  <THead>
                    <tr>
                      <TH>{t("invoice")}</TH>
                      <TH>{t("date")}</TH>
                      <TH className="text-right">{t("amount")}</TH>
                      <TH>{t("status")}</TH>
                      <TH className="text-right">
                        <span className="sr-only">{t("download")}</span>
                      </TH>
                    </tr>
                  </THead>
                  <tbody>
                    {b.invoices.map((inv) => (
                      <TR key={inv.id}>
                        <TD className="font-semibold">{inv.invoiceNumber ?? "—"}</TD>
                        <TD className="tabular whitespace-nowrap text-muted-foreground">{formatDate(inv.date, tz)}</TD>
                        <TD className="tabular text-right font-semibold">
                          {formatMoney(inv.amountMinor, inv.currency, b.locale)}
                          {inv.refundedMinor > 0 ? (
                            <span className="block text-[12px] font-normal text-muted-foreground">{t("refunded", { amount: formatMoney(inv.refundedMinor, inv.currency, b.locale) })}</span>
                          ) : null}
                        </TD>
                        <TD>
                          <PaymentStatusPill status={inv.status} />
                          {inv.status === "FAILED" && inv.failureReason ? <span className="mt-1 block text-[12px] text-danger">{inv.failureReason}</span> : null}
                        </TD>
                        <TD className="text-right">
                          {inv.fileId ? (
                            <a href={`/api/files/${inv.fileId}`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={t("downloadLabel", { number: inv.invoiceNumber ?? "" })}>
                              <Download className="h-4 w-4" aria-hidden="true" />
                              {t("download")}
                            </a>
                          ) : (
                            <span className="text-[13px] text-muted-foreground">{inv.status === "SUCCEEDED" ? t("noPdf") : ""}</span>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            </>
          )}
        </section>

        <p className="text-sm text-muted-foreground">
          {t.rich("help", {
            contact: (ch) => (
              <Link href="/app/messages" className="font-semibold text-primary underline-offset-2 hover:underline">
                {ch}
              </Link>
            ),
          })}
        </p>
      </div>
    </>
  );
}
