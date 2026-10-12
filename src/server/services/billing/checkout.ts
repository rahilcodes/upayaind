import "server-only";
import { z } from "zod";
import type { BillingInterval } from "@/generated/prisma/enums";
import { absoluteUrl } from "@/lib/utils";
import { db } from "@/server/db";
import { trackEvent } from "@/server/services/events";
import { syncCouponToProvider, validateCoupon, type CouponCheck } from "./coupons";
import { providerFor, simulationEnabled } from "./provider";
import { simulateCheckoutPayment } from "./simulate";
import { BillingError } from "./types";

export const checkoutInputSchema = z.object({
  planPriceId: z.string().trim().min(1, "Choose a plan").max(64),
  coupon: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
});

type Student = { userId: string; studentId: string };

export type CheckoutQuote = {
  planPriceId: string;
  planName: string;
  planDescription: string | null;
  features: string[];
  interval: BillingInterval;
  amountMinor: number;
  currency: string;
  locale: string;
  dailyTarget: number;
  interviewsPromise: string | null;
  marketName: string;
  coupon: CouponCheck | null;
  totalMinor: number;
  recurring: boolean;
};

/**
 * Validate a plan price for purchase (SPEC F1/§6.3): active price, active plan,
 * active market, the student's own market, and at least market.minPriceMinor
 * (placeholder prices are never purchasable).
 */
export async function getCheckoutQuote(s: Student, planPriceId: string, couponCode?: string | null): Promise<CheckoutQuote> {
  const pp = await db.planPrice.findUnique({
    where: { id: planPriceId },
    select: {
      id: true,
      interval: true,
      amountMinor: true,
      currency: true,
      dailyTarget: true,
      interviewsPromise: true,
      isActive: true,
      marketId: true,
      plan: { select: { name: true, description: true, features: true, isActive: true, deletedAt: true } },
      market: { select: { name: true, isActive: true, minPriceMinor: true, locale: true, currency: true } },
    },
  });
  if (!pp || !pp.isActive || !pp.plan.isActive || pp.plan.deletedAt) throw new BillingError("This plan is no longer available. Please choose another plan.");
  if (!pp.market.isActive) throw new BillingError("We don’t sell plans in this country yet.");
  if (pp.amountMinor < pp.market.minPriceMinor || pp.amountMinor <= 0) throw new BillingError("This plan’s price hasn’t been set yet. Please contact us or choose another plan.");

  const student = await db.studentProfile.findUnique({ where: { id: s.studentId }, select: { marketId: true, market: { select: { name: true } } } });
  if (!student) throw new BillingError("Complete your profile before checking out.");
  if (student.marketId !== pp.marketId) throw new BillingError(`This plan is for ${pp.market.name}. Choose a plan for ${student.market.name} on the pricing page.`);

  const coupon = couponCode ? await validateCoupon(couponCode, { id: pp.id, amountMinor: pp.amountMinor, currency: pp.currency }) : null;
  return {
    planPriceId: pp.id,
    planName: pp.plan.name,
    planDescription: pp.plan.description,
    features: pp.plan.features,
    interval: pp.interval,
    amountMinor: pp.amountMinor,
    currency: pp.currency,
    locale: pp.market.locale,
    dailyTarget: pp.dailyTarget,
    interviewsPromise: pp.interviewsPromise,
    marketName: pp.market.name,
    coupon,
    totalMinor: coupon ? coupon.finalMinor : pp.amountMinor,
    recurring: pp.interval !== "ONE_TIME",
  };
}

/** Does the student already have a live recurring plan? (Changes go through the customer portal.) */
export async function liveRecurringSubscription(studentId: string) {
  return db.subscription.findFirst({
    where: { studentId, status: { in: ["ACTIVE", "PAST_DUE", "PAUSED"] }, planPrice: { interval: { not: "ONE_TIME" } } },
    select: { id: true, status: true },
  });
}

export type StartCheckoutResult = { kind: "redirect"; url: string } | { kind: "simulate"; subscriptionId: string };

/**
 * Start checkout: store a PENDING_PAYMENT Subscription and create the provider
 * session. Never activates anything — only the webhook does (SPEC F1.4).
 */
export async function startCheckout(s: Student & { email: string }, raw: z.input<typeof checkoutInputSchema>): Promise<StartCheckoutResult> {
  const input = checkoutInputSchema.parse(raw);
  const quote = await getCheckoutQuote(s, input.planPriceId, input.coupon);
  if (await liveRecurringSubscription(s.studentId)) {
    throw new BillingError("You already have an active plan. Use “Manage subscription” on the Billing page to change it.");
  }

  const pp = await db.planPrice.findUniqueOrThrow({
    where: { id: quote.planPriceId },
    select: { id: true, providerPriceId: true, plan: { select: { code: true } }, market: { select: { code: true, paymentProvider: true } } },
  });
  const provider = providerFor(pp.market.paymentProvider);
  const simulate = !provider.isConfigured() && provider.code === "STRIPE" && simulationEnabled();
  if (!provider.isConfigured() && !simulate) {
    throw new BillingError(
      provider.code === "STRIPE"
        ? "Online payments aren’t set up yet. Please contact support to complete your purchase."
        : "Payments for this country are not available yet. Please contact us and we’ll help you sign up.",
    );
  }

  // One pending checkout per student: reuse it (switching plan is fine).
  const pending = await db.subscription.findFirst({ where: { studentId: s.studentId, status: "PENDING_PAYMENT" }, orderBy: { createdAt: "desc" }, select: { id: true } });
  const sub = pending
    ? await db.subscription.update({ where: { id: pending.id }, data: { planPriceId: pp.id, provider: provider.code }, select: { id: true } })
    : await db.subscription.create({ data: { studentId: s.studentId, planPriceId: pp.id, status: "PENDING_PAYMENT", provider: provider.code }, select: { id: true } });

  await trackEvent("checkout_started", s.userId, { planPriceId: pp.id, amountMinor: quote.totalMinor, currency: quote.currency, coupon: quote.coupon?.code ?? null, simulated: simulate });

  if (simulate) return { kind: "simulate", subscriptionId: sub.id };

  let providerCouponId = quote.coupon?.providerCouponId ?? null;
  if (quote.coupon && !providerCouponId) providerCouponId = (await syncCouponToProvider(null, quote.coupon.id)).providerCouponId;

  const prior = await db.subscription.findFirst({
    where: { studentId: s.studentId, providerCustomerId: { not: null }, provider: provider.code },
    orderBy: { createdAt: "desc" },
    select: { providerCustomerId: true },
  });
  const metadata: Record<string, string> = { subscriptionId: sub.id, studentId: s.studentId, planPriceId: pp.id, ...(quote.coupon ? { couponId: quote.coupon.id } : {}) };
  const session = await provider.createCheckoutSession({
    mode: quote.recurring ? "subscription" : "payment",
    localSubscriptionId: sub.id,
    studentId: s.studentId,
    planPriceId: pp.id,
    customerId: prior?.providerCustomerId?.startsWith("cus_sim_") ? null : (prior?.providerCustomerId ?? null),
    customerEmail: s.email,
    line: { providerPriceId: pp.providerPriceId, amountMinor: quote.amountMinor, currency: quote.currency, productName: `UpayaInd ${quote.planName}`, interval: quote.interval },
    providerCouponId,
    successUrl: absoluteUrl("/app/onboarding?paid=1"),
    cancelUrl: absoluteUrl(`/pricing?canceled=1`),
    metadata,
  });
  return { kind: "redirect", url: session.url };
}

/** Dev-only: complete a simulated checkout via the real webhook processor. */
export async function completeSimulatedCheckout(s: Student, raw: { subscriptionId: string; coupon?: string }) {
  const input = z.object({ subscriptionId: z.string().min(1).max(64), coupon: z.string().trim().max(40).optional() }).parse(raw);
  const sub = await db.subscription.findUnique({ where: { id: input.subscriptionId }, select: { studentId: true, status: true, planPriceId: true } });
  if (!sub || sub.studentId !== s.studentId) throw new BillingError("Checkout not found. Start again from the pricing page.");
  if (sub.status !== "PENDING_PAYMENT") throw new BillingError("This checkout was already completed.");
  const quote = await getCheckoutQuote(s, sub.planPriceId, input.coupon || null);
  return simulateCheckoutPayment(input.subscriptionId, { discountMinor: quote.coupon?.discountMinor ?? 0, couponId: quote.coupon?.id ?? null });
}
