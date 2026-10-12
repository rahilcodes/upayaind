import "server-only";
import { absoluteUrl } from "@/lib/utils";
import { db } from "@/server/db";
import { invoiceFileIds } from "./invoices";
import { providerFor, simulationEnabled } from "./provider";
import { BillingError } from "./types";

/** Data for the student /app/billing page. */
export async function getStudentBilling(studentId: string) {
  const [subs, payments, student] = await Promise.all([
    db.subscription.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        provider: true,
        providerCustomerId: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        createdAt: true,
        planPrice: {
          select: { id: true, interval: true, amountMinor: true, currency: true, dailyTarget: true, isActive: true, plan: { select: { name: true } }, market: { select: { locale: true, minPriceMinor: true } } },
        },
      },
    }),
    db.payment.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, invoiceNumber: true, invoiceKey: true, amountMinor: true, currency: true, taxMinor: true, refundedMinor: true, status: true, paidAt: true, createdAt: true, failureReason: true },
    }),
    db.studentProfile.findUnique({ where: { id: studentId }, select: { market: { select: { locale: true } } } }),
  ]);

  // The "current" plan: a live one first, then the most recent non-pending one.
  const live = subs.find((s) => s.status === "ACTIVE" || s.status === "PAST_DUE" || s.status === "PAUSED");
  const current = live ?? subs.find((s) => s.status !== "PENDING_PAYMENT") ?? null;
  const pending = subs.find((s) => s.status === "PENDING_PAYMENT") ?? null;
  const files = await invoiceFileIds(payments.map((p) => p.invoiceKey));

  const pp = (current ?? pending)?.planPrice;
  const canRenew = Boolean(pp && pp.isActive && pp.amountMinor >= pp.market.minPriceMinor);

  return {
    locale: student?.market.locale ?? "en-US",
    current: current
      ? {
          id: current.id,
          status: current.status,
          planName: current.planPrice.plan.name,
          interval: current.planPrice.interval,
          amountMinor: current.planPrice.amountMinor,
          currency: current.planPrice.currency,
          dailyTarget: current.planPrice.dailyTarget,
          currentPeriodEnd: current.currentPeriodEnd,
          cancelAtPeriodEnd: current.cancelAtPeriodEnd,
          canManage: Boolean(current.providerCustomerId) && current.planPrice.interval !== "ONE_TIME",
          provider: current.provider,
        }
      : null,
    pending: pending ? { id: pending.id, planPriceId: pending.planPrice.id, planName: pending.planPrice.plan.name } : null,
    renewPlanPriceId: canRenew ? pp!.id : null,
    invoices: payments.map((p) => ({
      id: p.id,
      invoiceNumber: p.invoiceNumber,
      fileId: p.invoiceKey ? (files.get(p.invoiceKey) ?? null) : null,
      amountMinor: p.amountMinor,
      currency: p.currency,
      refundedMinor: p.refundedMinor,
      status: p.status,
      date: p.paidAt ?? p.createdAt,
      failureReason: p.failureReason,
    })),
  };
}

/** Stripe customer portal (upgrade/downgrade/cancel/payment method). Webhooks keep data in sync. */
export async function createPortalSession(studentId: string) {
  const sub = await db.subscription.findFirst({
    where: { studentId, providerCustomerId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { provider: true, providerCustomerId: true },
  });
  if (!sub?.providerCustomerId) throw new BillingError("There’s no subscription to manage yet. Choose a plan first.");
  if (sub.providerCustomerId.startsWith("cus_sim_")) {
    throw new BillingError(
      simulationEnabled()
        ? "This is a simulated test payment, so there’s no Stripe customer portal for it. Add Stripe test keys to try the portal."
        : "Your billing account can’t be opened online. Please contact support.",
    );
  }
  const provider = providerFor(sub.provider);
  if (!provider.isConfigured()) throw new BillingError("Online billing management isn’t available right now. Please contact support.");
  const { url } = await provider.createPortalSession({ customerId: sub.providerCustomerId, returnUrl: absoluteUrl("/app/billing") });
  return { url };
}
