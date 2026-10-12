import "server-only";
import { createTranslator } from "next-intl";
import coreMessages from "@/i18n/messages/en/core.json";
import billingMessages from "@/i18n/messages/en/billing.json";
import { db } from "@/server/db";
import { storeGenerated } from "@/server/services/files";
import { getSetting } from "@/server/services/settings";
import { renderInvoicePdf } from "./invoice-pdf";
import { BillingError } from "./types";

/**
 * Generate (or re-generate) the invoice PDF of a successful payment, store it
 * privately (purpose "invoice", studentId set so the student and staff can
 * download it through /api/files/[id]) and link it on Payment.invoiceKey.
 */
export async function generateInvoiceForPayment(paymentId: string, ctx: { discountMinor?: number; periodStart?: Date | null; periodEnd?: Date | null } = {}) {
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      invoiceNumber: true,
      amountMinor: true,
      currency: true,
      taxMinor: true,
      status: true,
      paidAt: true,
      createdAt: true,
      providerPaymentId: true,
      studentId: true,
      student: { select: { userId: true, user: { select: { name: true, email: true, timezone: true } }, market: { select: { code: true, locale: true } } } },
      subscription: { select: { currentPeriodStart: true, currentPeriodEnd: true, planPrice: { select: { interval: true, plan: { select: { name: true } } } } } },
    },
  });
  if (!p) throw new BillingError("Payment not found.");
  if (!p.invoiceNumber || p.status === "FAILED" || p.status === "PENDING") throw new BillingError("Invoices exist only for successful payments.");

  const businessAll = await getSetting("business");
  const business = businessAll?.[p.student.market.code] ?? { legalName: "UpayaInd", address: "", taxId: "" };
  const tc = createTranslator({ locale: "en", messages: coreMessages, namespace: "interval" });
  const tb = createTranslator({ locale: "en", messages: billingMessages, namespace: "billing.invoicePdf" });
  const plan = p.subscription?.planPrice;
  const discount = Math.max(0, ctx.discountMinor ?? 0);
  const net = p.amountMinor - p.taxMinor;

  const buffer = await renderInvoicePdf({
    invoiceNumber: p.invoiceNumber,
    issuedAt: p.paidAt ?? p.createdAt,
    timezone: p.student.user.timezone,
    locale: p.student.market.locale,
    currency: p.currency,
    business,
    customer: { name: p.student.user.name, email: p.student.user.email },
    line: {
      description: plan ? tb("lineDescription", { plan: plan.plan.name, interval: tc(plan.interval) }) : tb("lineFallback"),
      periodStart: ctx.periodStart ?? p.subscription?.currentPeriodStart ?? null,
      periodEnd: ctx.periodEnd ?? p.subscription?.currentPeriodEnd ?? null,
      amountMinor: net + discount,
    },
    discountMinor: discount,
    taxMinor: p.taxMinor,
    totalMinor: p.amountMinor,
    status: "PAID",
    paymentRef: p.providerPaymentId,
  });

  const filename = `${p.invoiceNumber}.pdf`;
  const file = await storeGenerated({
    key: `invoices/${p.studentId}/${p.invoiceNumber}.pdf`,
    buffer,
    mime: "application/pdf",
    ownerUserId: p.student.userId,
    studentId: p.studentId,
    purpose: "invoice",
    filename,
  });
  await db.payment.update({ where: { id: p.id }, data: { invoiceKey: file.key } });
  return { fileId: file.id, key: file.key, filename, buffer };
}

/** Map invoice keys → FileObject ids (for /api/files/<id> links). */
export async function invoiceFileIds(keys: (string | null)[]) {
  const ks = keys.filter((k): k is string => Boolean(k));
  if (!ks.length) return new Map<string, string>();
  const rows = await db.fileObject.findMany({ where: { key: { in: ks } }, select: { id: true, key: true } });
  return new Map(rows.map((r) => [r.key, r.id]));
}
