import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Download, Receipt } from "lucide-react";
import { PaymentStatusPill } from "@/components/billing/status-pills";
import { Pagination, withParams } from "@/components/portal/pagination";
import { PageHeader } from "@/components/portal/portal-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/input";
import { TableWrap, Table, THead, TH, TR, TD } from "@/components/ui/table";
import { PaymentStatus } from "@/generated/prisma/enums";
import { requireRole } from "@/server/auth/guards";
import { listPayments } from "@/server/services/billing";
import { formatInTz, formatMoney } from "@/lib/format";
import { RefundDialog } from "./refund-dialog";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  const sp = await searchParams;
  const t = await getTranslations("billing.admin.payments");
  const ts = await getTranslations("billing.paymentStatus");
  const ti = await getTranslations("interval");
  const data = await listPayments(sp);
  const canRefund = user.role === "ADMIN";
  const f = data.filter;
  const current = { q: f.q, status: f.status, currency: f.currency, market: f.market, from: f.from, to: f.to };
  const filtered = Object.values(current).some(Boolean);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {!canRefund ? (
        <p role="status" className="mb-4 rounded-[12px] border border-[#C6D9FC] bg-[#EAF1FE] px-4 py-3 text-sm text-[#1A4FB8]">
          {t("readOnly")}
        </p>
      ) : null}

      <form method="get" className="mb-5 grid grid-cols-2 gap-3 rounded-[18px] border border-border bg-surface p-4 lg:grid-cols-[2fr_repeat(5,1fr)_auto] lg:items-end">
        <Field id="q" label={t("search")} className="col-span-2 lg:col-span-1">
          <Input id="q" name="q" defaultValue={f.q} placeholder={t("searchPlaceholder")} type="search" />
        </Field>
        <Field id="status" label={t("status")}>
          <Select id="status" name="status" defaultValue={f.status ?? ""}>
            <option value="">{t("any")}</option>
            {Object.values(PaymentStatus).map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="currency" label={t("currency")}>
          <Select id="currency" name="currency" defaultValue={f.currency ?? ""}>
            <option value="">{t("any")}</option>
            {data.currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="market" label={t("market")}>
          <Select id="market" name="market" defaultValue={f.market ?? ""}>
            <option value="">{t("any")}</option>
            {data.markets.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="from" label={t("from")}>
          <Input id="from" name="from" type="date" defaultValue={f.from} />
        </Field>
        <Field id="to" label={t("to")}>
          <Input id="to" name="to" type="date" defaultValue={f.to} />
        </Field>
        <div className="col-span-2 flex gap-2 lg:col-span-1">
          <Button type="submit" className="h-12 flex-1 lg:flex-none">
            {t("apply")}
          </Button>
          {filtered ? (
            <Link href="/admin/payments" className={buttonVariants({ variant: "ghost", className: "h-12" })}>
              {t("clear")}
            </Link>
          ) : null}
        </div>
      </form>

      {data.totals.length ? (
        <section aria-label={t("totalsTitle")} className="mb-5 flex flex-wrap gap-3">
          {data.totals.map((x) => (
            <div key={x.currency} className="min-w-[220px] flex-1 rounded-[16px] border border-border bg-surface px-5 py-4 sm:flex-none">
              <p className="text-sm font-medium text-muted-foreground">
                {t("totalsTitle")} · {x.currency}
              </p>
              <p className="tabular mt-1 text-[24px] font-bold">{formatMoney(x.grossMinor - x.refundedMinor, x.currency)}</p>
              <p className="text-[13px] text-muted-foreground">
                {t("totalLine", { gross: formatMoney(x.grossMinor, x.currency), count: x.count })}
                {x.refundedMinor ? ` · ${t("totalRefunded", { amount: formatMoney(x.refundedMinor, x.currency) })}` : ""}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState icon={<Receipt className="h-6 w-6" aria-hidden="true" />} title={t("empty")} body={t("emptyBody")} className="bg-surface" />
      ) : (
        <TableWrap>
          <Table className="min-w-[1000px]">
            <THead>
              <tr>
                <TH>{t("date")}</TH>
                <TH>{t("student")}</TH>
                <TH>{t("plan")}</TH>
                <TH className="text-right">{t("amount")}</TH>
                <TH>{t("status")}</TH>
                <TH>{t("invoice")}</TH>
                <TH className="text-right">{t("actions")}</TH>
              </tr>
            </THead>
            <tbody>
              {data.items.map((p) => (
                <TR key={p.id}>
                  <TD className="tabular whitespace-nowrap text-[13px]">{formatInTz(p.paidAt ?? p.createdAt, user.timezone, "d MMM yyyy, h:mm a")}</TD>
                  <TD>
                    <p className="font-semibold">{p.student.user.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {p.student.user.email} · {p.student.market.code}
                    </p>
                  </TD>
                  <TD className="text-[13px]">
                    {p.subscription ? `${p.subscription.planPrice.plan.name} · ${ti(p.subscription.planPrice.interval)}` : "—"}
                    <span className="block text-[12px] text-muted-foreground">
                      {p.provider === "MANUAL" ? t("manual") : p.provider}
                      {p.method ? ` · ${t(`method.${p.method}` as "method.bank")}` : ""}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                  </TD>
                  <TD className="tabular text-right">
                    <span className="font-semibold">{formatMoney(p.amountMinor, p.currency, p.student.market.locale)}</span>
                    {p.refundedMinor ? <span className="block text-[12px] text-muted-foreground">{t("refunded", { amount: formatMoney(p.refundedMinor, p.currency, p.student.market.locale) })}</span> : null}
                  </TD>
                  <TD>
                    <PaymentStatusPill status={p.status} />
                    {p.status === "FAILED" && p.failureReason ? <span className="mt-1 block max-w-[200px] truncate text-[12px] text-danger" title={p.failureReason}>{p.failureReason}</span> : null}
                  </TD>
                  <TD>
                    {p.invoiceNumber ? <span className="text-[13px] font-semibold">{p.invoiceNumber}</span> : <span className="text-muted-foreground">—</span>}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1.5">
                      {p.fileId ? (
                        <a href={`/api/files/${p.fileId}`} className={buttonVariants({ variant: "ghost", size: "sm" })} aria-label={t("pdfLabel", { number: p.invoiceNumber ?? "" })}>
                          <Download className="h-4 w-4" aria-hidden="true" />
                          {t("pdf")}
                        </a>
                      ) : null}
                      {canRefund && (p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED") && p.refundableMinor > 0 ? (
                        <RefundDialog
                          paymentId={p.id}
                          invoiceNumber={p.invoiceNumber ?? p.id}
                          currency={p.currency}
                          locale={p.student.market.locale}
                          maxMinor={p.refundableMinor}
                          provider={p.provider === "MANUAL" ? t("manual") : p.provider === "STRIPE" ? "Stripe" : p.provider}
                        />
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
      <Pagination
        prevHref={f.cursor ? withParams("/admin/payments", current, {}) : null}
        nextHref={data.nextCursor ? withParams("/admin/payments", current, { cursor: data.nextCursor }) : null}
        label={t("pagination")}
      />
    </>
  );
}
