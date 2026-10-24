import "server-only";
import { z } from "zod";
import { nanoid } from "nanoid";
import type { Role } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { can } from "@/server/auth/rbac";
import { audit } from "@/server/services/audit";
import { notify } from "@/server/services/notify";
import { periodEndFor } from "@/lib/billing-period";
import { BillingError } from "./types";
import { activate, afterPayment, recordSuccessfulPayment } from "./webhooks";

/**
 * Admin-managed plans and payments (D-147b). Everything here is `provider:
 * "MANUAL"`: an admin grants a plan after an offline payment (bank transfer,
 * cash, UPI, …), changes it, edits its period or status, and records the
 * payment with a real invoice number. Gateway subscriptions (Stripe/Razorpay)
 * are read-only here — the gateway is the source of truth for them and the
 * webhook processor keeps the local row in sync — so every mutating function
 * refuses them with a message that points the admin to the gateway.
 *
 * Manual plans never auto-renew: the nightly sweep (renewals.ts) expires an
 * ACTIVE MANUAL row at `currentPeriodEnd`. Extending the period is the renewal.
 *
 * Activation reuses `activate()` from webhooks.ts so the invariants hold
 * (one live plan per student, `subscription.activated` → auto-assignment).
 */

export type Actor = { id: string; role: Role };

const GATEWAYS = new Set(["STRIPE", "RAZORPAY"]);

function guard(actor: Actor) {
  if (!can(actor.role, "billing.manage")) throw new ForbiddenError("Only an admin can manage plans and payments.");
}

const id = z.string().min(1).max(64);
const note = z.string().trim().max(500).optional();
const dateIn = z.coerce.date();

export const grantPlanSchema = z.object({
  studentId: id,
  planPriceId: id,
  startsAt: dateIn.optional(),
  periodEnd: dateIn.optional(),
  status: z.enum(["ACTIVE", "PENDING_PAYMENT"]).default("ACTIVE"),
  note,
});
export const changePlanSchema = z.object({ subscriptionId: id, planPriceId: id, note });
export const setPeriodSchema = z.object({ subscriptionId: id, currentPeriodStart: dateIn, currentPeriodEnd: dateIn });
export const setStatusSchema = z.object({ subscriptionId: id, status: z.enum(["ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"]), note });
export const cancelAtPeriodEndSchema = z.object({ subscriptionId: id, cancel: z.boolean() });
export const MANUAL_PAYMENT_METHODS = ["bank", "cash", "upi", "card", "other"] as const;
export const manualPaymentSchema = z.object({
  studentId: id,
  subscriptionId: id.optional().nullable(),
  amountMinor: z.coerce.number().int().positive("Enter an amount above zero"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Enter a 3-letter currency code"),
  paidAt: dateIn,
  method: z.enum(MANUAL_PAYMENT_METHODS),
  reference: z.string().trim().max(120).optional(),
  note,
});

const PRICE_SELECT = {
  id: true,
  interval: true,
  amountMinor: true,
  currency: true,
  dailyTarget: true,
  isActive: true,
  marketId: true,
  plan: { select: { id: true, name: true, isActive: true, deletedAt: true } },
} as const;

const SUB_SELECT = {
  id: true,
  status: true,
  provider: true,
  planPriceId: true,
  studentId: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  pausedAt: true,
  remindersSent: true,
  planPrice: { select: { interval: true, currency: true, dailyTarget: true, plan: { select: { name: true } } } },
  student: { select: { marketId: true, userId: true, market: { select: { currency: true } } } },
} as const;

/** Active prices of active plans in a market, for the grant/change pickers. Zero-amount placeholders are flagged, not hidden. */
export async function listGrantablePrices(marketId: string) {
  const rows = await db.planPrice.findMany({
    where: { marketId, isActive: true, plan: { isActive: true, deletedAt: null } },
    orderBy: [{ plan: { name: "asc" } }, { amountMinor: "asc" }],
    select: { id: true, interval: true, amountMinor: true, currency: true, dailyTarget: true, plan: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, planName: r.plan.name, interval: r.interval, amountMinor: r.amountMinor, currency: r.currency, dailyTarget: r.dailyTarget, placeholder: r.amountMinor <= 0 }));
}

async function loadPriceForMarket(planPriceId: string, marketId: string) {
  const pp = await db.planPrice.findUnique({ where: { id: planPriceId }, select: PRICE_SELECT });
  if (!pp || !pp.isActive || !pp.plan.isActive || pp.plan.deletedAt) throw new BillingError("This plan price isn’t active. Pick an active price.", "planPriceId");
  if (pp.marketId !== marketId) throw new BillingError("This price belongs to another market. Pick a price for the student’s market.", "planPriceId");
  return pp;
}

async function loadSub(subscriptionId: string) {
  const s = await db.subscription.findUnique({ where: { id: subscriptionId }, select: SUB_SELECT });
  if (!s) throw new BillingError("Subscription not found.");
  return s;
}

function assertManual(s: { provider: string }) {
  if (s.provider !== "MANUAL") throw new BillingError(`This subscription is managed by ${s.provider}. Change it in the gateway (or cancel it there) — the webhook keeps this record in sync.`);
}

/** Refuse a manual grant while a gateway plan is live: two live plans would double-bill the student. */
async function assertNoLiveGatewayPlan(studentId: string) {
  const live = await db.subscription.findFirst({ where: { studentId, status: { in: ["ACTIVE", "PAUSED"] }, provider: { in: [...GATEWAYS] } }, select: { provider: true, status: true } });
  if (live) throw new BillingError(`This student has a ${live.status === "PAUSED" ? "paused" : "live"} ${live.provider} subscription. Change or cancel it in the gateway first.`);
  const paused = await db.subscription.findFirst({ where: { studentId, status: "PAUSED", provider: "MANUAL" }, select: { id: true } });
  if (paused) throw new BillingError("This student has a paused manual plan. Resume or cancel it before granting another plan.");
}

export async function grantPlan(actor: Actor, raw: z.input<typeof grantPlanSchema>) {
  guard(actor);
  const v = grantPlanSchema.parse(raw);
  const student = await db.studentProfile.findUnique({ where: { id: v.studentId }, select: { id: true, marketId: true, user: { select: { deletedAt: true } } } });
  if (!student || student.user.deletedAt) throw new BillingError("Student not found.");
  const pp = await loadPriceForMarket(v.planPriceId, student.marketId);
  await assertNoLiveGatewayPlan(student.id);

  const startsAt = v.startsAt ?? new Date();
  const periodEnd = v.periodEnd ?? periodEndFor(startsAt, pp.interval);
  if (periodEnd <= startsAt) throw new BillingError("The period end must be after the start.", "periodEnd");

  const sub = await db.subscription.create({
    data: { studentId: student.id, planPriceId: pp.id, status: "PENDING_PAYMENT", provider: "MANUAL", currentPeriodStart: startsAt, currentPeriodEnd: periodEnd, remindersSent: [] },
    select: { id: true },
  });
  await audit({
    actorId: actor.id,
    action: "subscription.grant",
    entity: "Subscription",
    entityId: sub.id,
    after: { studentId: student.id, planPriceId: pp.id, plan: pp.plan.name, interval: pp.interval, status: v.status, currentPeriodStart: startsAt, currentPeriodEnd: periodEnd, note: v.note ?? null },
  });
  if (v.status === "ACTIVE") await activate(sub.id, { periodStart: startsAt, periodEnd, actorId: actor.id });
  return { subscriptionId: sub.id, status: v.status, currentPeriodStart: startsAt, currentPeriodEnd: periodEnd };
}

export async function changePlan(actor: Actor, raw: z.input<typeof changePlanSchema>) {
  guard(actor);
  const v = changePlanSchema.parse(raw);
  const s = await loadSub(v.subscriptionId);
  assertManual(s);
  if (s.status === "CANCELED" || s.status === "EXPIRED") throw new BillingError("This subscription has ended. Grant a new plan instead.");
  if (v.planPriceId === s.planPriceId) throw new BillingError("The subscription is already on this plan.", "planPriceId");
  const pp = await loadPriceForMarket(v.planPriceId, s.student.marketId);
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: s.id }, data: { planPriceId: pp.id } });
    await audit(
      { actorId: actor.id, action: "subscription.change_plan", entity: "Subscription", entityId: s.id, before: { planPriceId: s.planPriceId, plan: s.planPrice.plan.name }, after: { planPriceId: pp.id, plan: pp.plan.name, interval: pp.interval, note: v.note ?? null } },
      tx,
    );
  });
  if (s.status === "ACTIVE" || s.status === "PAUSED") await notify(s.student.userId, "plan_changed", { plan: pp.plan.name, target: pp.dailyTarget }).catch(() => undefined);
  return { subscriptionId: s.id, planPriceId: pp.id };
}

export async function setSubscriptionPeriod(actor: Actor, raw: z.input<typeof setPeriodSchema>) {
  guard(actor);
  const v = setPeriodSchema.parse(raw);
  if (v.currentPeriodEnd <= v.currentPeriodStart) throw new BillingError("The period end must be after the start.", "currentPeriodEnd");
  const s = await loadSub(v.subscriptionId);
  assertManual(s);
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: s.id }, data: { currentPeriodStart: v.currentPeriodStart, currentPeriodEnd: v.currentPeriodEnd, remindersSent: [] } });
    await audit(
      { actorId: actor.id, action: "subscription.set_period", entity: "Subscription", entityId: s.id, before: { currentPeriodStart: s.currentPeriodStart, currentPeriodEnd: s.currentPeriodEnd }, after: { currentPeriodStart: v.currentPeriodStart, currentPeriodEnd: v.currentPeriodEnd } },
      tx,
    );
  });
  return { subscriptionId: s.id, currentPeriodStart: v.currentPeriodStart, currentPeriodEnd: v.currentPeriodEnd };
}

export async function setSubscriptionStatus(actor: Actor, raw: z.input<typeof setStatusSchema>) {
  guard(actor);
  const v = setStatusSchema.parse(raw);
  const s = await loadSub(v.subscriptionId);
  assertManual(s);
  if (v.status === s.status) throw new BillingError(`The subscription is already ${s.status.toLowerCase().replace("_", " ")}.`);

  if (v.status === "ACTIVE") {
    if (s.status === "PAUSED") throw new BillingError("This plan is paused. Use “Resume plan” so the paused days are added back.");
    if (!s.currentPeriodEnd) throw new BillingError("Set the period before activating.", "currentPeriodEnd");
    if (s.currentPeriodEnd <= new Date()) throw new BillingError("The period has already ended. Extend the period first, then activate.", "currentPeriodEnd");
    await audit({ actorId: actor.id, action: "subscription.set_status", entity: "Subscription", entityId: s.id, before: { status: s.status }, after: { status: "ACTIVE", note: v.note ?? null } });
    await activate(s.id, { periodStart: null, periodEnd: null, actorId: actor.id });
    return { subscriptionId: s.id, status: "ACTIVE" as const };
  }

  const ends = v.status === "CANCELED" || v.status === "EXPIRED";
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: s.id }, data: { status: v.status, ...(ends ? { cancelAtPeriodEnd: false, pausedAt: null } : {}) } });
    await audit({ actorId: actor.id, action: "subscription.set_status", entity: "Subscription", entityId: s.id, before: { status: s.status }, after: { status: v.status, note: v.note ?? null } }, tx);
  });
  if (v.status === "CANCELED") await notify(s.student.userId, "subscription_canceled", { plan: s.planPrice.plan.name }).catch(() => undefined);
  return { subscriptionId: s.id, status: v.status };
}

export async function cancelAtPeriodEnd(actor: Actor, raw: z.input<typeof cancelAtPeriodEndSchema>) {
  guard(actor);
  const v = cancelAtPeriodEndSchema.parse(raw);
  const s = await loadSub(v.subscriptionId);
  if (s.provider !== "MANUAL") throw new BillingError(`Cancellation at period end for a ${s.provider} subscription is set in the gateway; the webhook syncs it here.`);
  if (s.status !== "ACTIVE" && s.status !== "PAUSED") throw new BillingError("Only an active or paused plan can be set to end at the period end.");
  if (s.cancelAtPeriodEnd === v.cancel) return { subscriptionId: s.id, cancelAtPeriodEnd: s.cancelAtPeriodEnd };
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: s.id }, data: { cancelAtPeriodEnd: v.cancel } });
    await audit({ actorId: actor.id, action: v.cancel ? "subscription.cancel_at_period_end" : "subscription.keep", entity: "Subscription", entityId: s.id, before: { cancelAtPeriodEnd: s.cancelAtPeriodEnd }, after: { cancelAtPeriodEnd: v.cancel } }, tx);
  });
  return { subscriptionId: s.id, cancelAtPeriodEnd: v.cancel };
}

/**
 * Record an offline payment: SUCCEEDED Payment with a sequential invoice number,
 * invoice PDF + receipt email + referral credit via the shared `afterPayment`.
 * A PENDING_PAYMENT subscription becomes ACTIVE (period from `paidAt`).
 */
export async function recordManualPayment(actor: Actor, raw: z.input<typeof manualPaymentSchema>) {
  guard(actor);
  const v = manualPaymentSchema.parse(raw);
  const student = await db.studentProfile.findUnique({ where: { id: v.studentId }, select: { id: true, market: { select: { currency: true } }, user: { select: { deletedAt: true } } } });
  if (!student || student.user.deletedAt) throw new BillingError("Student not found.");

  const sub = v.subscriptionId ? await loadSub(v.subscriptionId) : null;
  if (sub && sub.studentId !== student.id) throw new BillingError("That subscription belongs to another student.", "subscriptionId");
  const expected = sub ? sub.planPrice.currency : student.market.currency;
  if (v.currency !== expected.toUpperCase()) throw new BillingError(`Payments for this student are recorded in ${expected}.`, "currency");
  if (v.paidAt.getTime() > Date.now() + 86_400_000) throw new BillingError("The payment date can’t be in the future.", "paidAt");

  let period: { start: Date | null; end: Date | null } = { start: null, end: null };
  if (sub && sub.status === "PENDING_PAYMENT") {
    if (sub.provider !== "MANUAL") throw new BillingError(`This ${sub.provider} checkout hasn’t completed. Record the payment without a subscription, or grant a manual plan.`, "subscriptionId");
    const start = sub.currentPeriodStart ?? v.paidAt;
    const end = sub.currentPeriodEnd && sub.currentPeriodEnd > start ? sub.currentPeriodEnd : periodEndFor(start, sub.planPrice.interval);
    period = { start, end };
    await activate(sub.id, { periodStart: start, periodEnd: end, actorId: actor.id });
  } else if (sub) {
    period = { start: sub.currentPeriodStart, end: sub.currentPeriodEnd };
  }

  const providerPaymentId = `manual_${nanoid(16)}`;
  const pay = await recordSuccessfulPayment({
    subscriptionId: sub?.id ?? null,
    studentId: student.id,
    providerPaymentId,
    provider: "MANUAL",
    amountMinor: v.amountMinor,
    currency: v.currency,
    taxMinor: 0,
    discountMinor: 0,
    paidAt: v.paidAt,
    periodStart: period.start,
    periodEnd: period.end,
    method: v.method,
    reference: v.reference ?? null,
  });
  await audit({
    actorId: actor.id,
    action: "payment.manual",
    entity: "Payment",
    entityId: pay.paymentId,
    after: { studentId: student.id, subscriptionId: sub?.id ?? null, amountMinor: v.amountMinor, currency: v.currency, paidAt: v.paidAt, method: v.method, reference: v.reference ?? null, note: v.note ?? null, providerPaymentId },
  });
  await afterPayment(pay.paymentId, { discountMinor: 0, periodStart: period.start, periodEnd: period.end });
  const row = await db.payment.findUniqueOrThrow({ where: { id: pay.paymentId }, select: { id: true, invoiceNumber: true } });
  return { paymentId: row.id, invoiceNumber: row.invoiceNumber, subscriptionId: sub?.id ?? null };
}
