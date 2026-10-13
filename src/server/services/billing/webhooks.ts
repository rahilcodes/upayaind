import "server-only";
import type Stripe from "stripe";
import type { Prisma } from "@/generated/prisma/client";
import type { SubscriptionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { emit } from "@/server/jobs";
import { audit } from "@/server/services/audit";
import { trackEvent } from "@/server/services/events";
import { notify, notifyManagers } from "@/server/services/notify";
import { sendAlert } from "@/server/services/alerts";
import { formatDate, formatMoney } from "@/lib/format";
import { redeemCoupon } from "./coupons";
import { generateInvoiceForPayment } from "./invoices";
import { onFirstPaymentSucceeded } from "@/server/services/referrals";
import { nextInvoiceNumber } from "./invoice-number";
import { normaliseStripeSubscription } from "./stripe";
import { providerFor } from "./provider";
import type { ProviderEvent, ProviderSubscription } from "./types";

/**
 * Webhook processing (SPEC F1 step 4, F11). This is the ONLY code path that
 * activates a subscription. It is shared by the Stripe route handler and the
 * dev-only simulated payment (D-021), so local testing exercises exactly the
 * production logic.
 *
 * Idempotency: every event is recorded in WebhookEvent by `event.id`; an event
 * that already has `processedAt` is skipped. Payments are additionally unique
 * on `providerPaymentId` (Stripe invoice / payment-intent id), so two different
 * events describing the same charge (checkout.session.completed + invoice.paid)
 * never create two Payment rows.
 */

export type WebhookOutcome = { status: "processed" | "duplicate" | "ignored" | "in_progress"; type: string; id: string; detail?: string };

/** WebhookEvent.error holds `processing:<epoch ms>` while a delivery is being processed. */
const LEASE_PREFIX = "processing:";
const LEASE_MS = 5 * 60_000;

const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function log(fields: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") return;
  console.info(JSON.stringify({ at: new Date().toISOString(), scope: "webhook", ...fields }));
}

export async function processWebhookEvent(provider: string, event: ProviderEvent): Promise<WebhookOutcome> {
  const started = Date.now();
  const base = { id: event.id, type: event.type };

  // Record first (idempotency key = event.id).
  await db.webhookEvent.createMany({
    data: [{ id: event.id, provider, type: event.type, payload: event as unknown as Prisma.InputJsonValue }],
    skipDuplicates: true,
  });

  if (!HANDLED.has(event.type)) {
    const n = await db.webhookEvent.updateMany({ where: { id: event.id, processedAt: null }, data: { processedAt: new Date(), error: null } });
    const status = n.count ? ("ignored" as const) : ("duplicate" as const);
    log({ ...base, provider, outcome: status, ms: Date.now() - started });
    return { ...base, status };
  }

  // Claim a processing lease atomically. Only one delivery wins; a lease older
  // than LEASE_MS (crashed worker) can be re-claimed by Stripe's next retry.
  const now = Date.now();
  const claimed = await db.$executeRaw`
    UPDATE "WebhookEvent" SET "error" = ${`${LEASE_PREFIX}${now}`}
    WHERE "id" = ${event.id} AND "processedAt" IS NULL
      AND ("error" IS NULL OR "error" NOT LIKE ${`${LEASE_PREFIX}%`} OR CAST(SPLIT_PART("error", ':', 2) AS BIGINT) < ${now - LEASE_MS}::bigint)`;
  if (claimed !== 1) {
    const row = await db.webhookEvent.findUnique({ where: { id: event.id }, select: { processedAt: true } });
    const status = row?.processedAt ? ("duplicate" as const) : ("in_progress" as const);
    log({ ...base, provider, outcome: status, ms: Date.now() - started });
    return { ...base, status };
  }

  try {
    const detail = await dispatch(event);
    await db.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), error: null } });
    log({ ...base, provider, outcome: "processed", detail, ms: Date.now() - started });
    return { ...base, status: "processed", detail };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: message.slice(0, 1000) } }).catch(() => undefined);
    log({ ...base, provider, outcome: "error", error: message, ms: Date.now() - started });
    throw e;
  }
}

async function dispatch(event: ProviderEvent): Promise<string> {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return onCheckoutCompleted(obj as Stripe.Checkout.Session);
    case "invoice.paid":
      return onInvoicePaid(obj as Stripe.Invoice);
    case "invoice.payment_failed":
      return onInvoiceFailed(obj as Stripe.Invoice);
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return onSubscriptionChanged(obj as Stripe.Subscription, event.type === "customer.subscription.deleted");
    default:
      return "unhandled";
  }
}

// ───────────────────────────── helpers ─────────────────────────────

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

const SUB_SELECT = {
  id: true,
  status: true,
  pausedAt: true,
  studentId: true,
  planPriceId: true,
  provider: true,
  providerSubId: true,
  providerCustomerId: true,
  currentPeriodEnd: true,
} as const;

async function findLocalSubscription(opts: { providerSubId?: string | null; localId?: string | null }) {
  if (opts.providerSubId) {
    const s = await db.subscription.findUnique({ where: { providerSubId: opts.providerSubId }, select: SUB_SELECT });
    if (s) return s;
  }
  if (opts.localId) return db.subscription.findUnique({ where: { id: opts.localId }, select: SUB_SELECT });
  return null;
}

async function resolveProviderSubscription(sub: string | Stripe.Subscription | null | undefined): Promise<ProviderSubscription | null> {
  if (!sub) return null;
  if (typeof sub !== "string") return normaliseStripeSubscription(sub);
  return providerFor("STRIPE").retrieveSubscription(sub);
}

function invoiceSubscriptionRef(inv: Stripe.Invoice): { subId: string | null; sub: string | Stripe.Subscription | null; metadata: Record<string, string> } {
  const details = inv.parent?.subscription_details ?? null;
  const legacy = (inv as unknown as { subscription?: string | Stripe.Subscription | null }).subscription ?? null;
  const sub = details?.subscription ?? legacy;
  return { subId: idOf(sub), sub, metadata: (details?.metadata ?? {}) as Record<string, string> };
}

/** Service period of a subscription invoice (from its subscription line). */
function invoicePeriod(inv: Stripe.Invoice): { start: Date | null; end: Date | null } {
  const line = inv.lines?.data?.find((l) => l.period?.end) ?? null;
  if (line?.period) return { start: new Date(line.period.start * 1000), end: new Date(line.period.end * 1000) };
  return { start: null, end: null };
}

function sumTaxes(inv: Stripe.Invoice) {
  const rows = (inv as unknown as { total_taxes?: { amount: number }[] | null }).total_taxes ?? [];
  return rows.reduce((a, r) => a + (r.amount ?? 0), 0);
}

function sumDiscounts(inv: Stripe.Invoice) {
  return (inv.total_discount_amounts ?? []).reduce((a, r) => a + (r.amount ?? 0), 0);
}

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

/**
 * Move a local subscription to ACTIVE with its period. Emits
 * `subscription.activated` (→ auto-assignment) only on a real transition.
 */
async function activate(
  subId: string,
  data: { periodStart: Date | null; periodEnd: Date | null; providerSubId?: string | null; providerCustomerId?: string | null; cancelAtPeriodEnd?: boolean },
) {
  const before = await db.subscription.findUniqueOrThrow({ where: { id: subId }, select: { status: true, studentId: true, currentPeriodEnd: true } });
  const newPeriod = data.periodEnd && before.currentPeriodEnd?.getTime() !== data.periodEnd.getTime();
  await db.subscription.update({
    where: { id: subId },
    data: {
      status: "ACTIVE",
      ...(data.periodStart ? { currentPeriodStart: data.periodStart } : {}),
      ...(data.periodEnd ? { currentPeriodEnd: data.periodEnd } : {}),
      ...(data.providerSubId ? { providerSubId: data.providerSubId } : {}),
      ...(data.providerCustomerId ? { providerCustomerId: data.providerCustomerId } : {}),
      ...(data.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: data.cancelAtPeriodEnd } : {}),
      ...(newPeriod ? { remindersSent: [] } : {}),
    },
  });
  if (before.status !== "ACTIVE") {
    // A student holds one live plan: close any other pending/active rows.
    await db.subscription.updateMany({
      where: { studentId: before.studentId, id: { not: subId }, status: { in: ["PENDING_PAYMENT", "ACTIVE", "PAST_DUE"] } },
      data: { status: "CANCELED", cancelAtPeriodEnd: false },
    });
    await audit({ action: "subscription.activate", entity: "Subscription", entityId: subId, before: { status: before.status }, after: { status: "ACTIVE", periodEnd: data.periodEnd } });
    await emit("subscription.activated", { studentId: before.studentId });
  }
  return { transitioned: before.status !== "ACTIVE" };
}

type PaymentInput = {
  subscriptionId: string;
  studentId: string;
  providerPaymentId: string;
  provider: string;
  amountMinor: number;
  currency: string;
  taxMinor: number;
  discountMinor: number;
  paidAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
};

/**
 * Record a successful payment exactly once (unique providerPaymentId) with a
 * sequential invoice number allocated in the same transaction. A previously
 * FAILED attempt for the same invoice is upgraded to SUCCEEDED.
 */
async function recordSuccessfulPayment(p: PaymentInput): Promise<{ paymentId: string; created: boolean }> {
  const existing = await db.payment.findUnique({ where: { providerPaymentId: p.providerPaymentId }, select: { id: true, status: true } });
  if (existing && existing.status !== "FAILED" && existing.status !== "PENDING") return { paymentId: existing.id, created: false };
  try {
    const paymentId = await db.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, p.paidAt);
      const data = {
        subscriptionId: p.subscriptionId,
        studentId: p.studentId,
        amountMinor: p.amountMinor,
        currency: p.currency.toUpperCase(),
        status: "SUCCEEDED" as const,
        provider: p.provider,
        taxMinor: p.taxMinor,
        failureReason: null,
        paidAt: p.paidAt,
        invoiceNumber,
      };
      if (existing) {
        // Guard the upgrade so two concurrent deliveries can't both win.
        const n = await tx.payment.updateMany({ where: { id: existing.id, status: { in: ["FAILED", "PENDING"] } }, data });
        if (n.count === 0) throw new AlreadyRecorded();
        return existing.id;
      }
      const row = await tx.payment.create({ data: { ...data, providerPaymentId: p.providerPaymentId }, select: { id: true } });
      return row.id;
    });
    return { paymentId, created: true };
  } catch (e) {
    if (e instanceof AlreadyRecorded || (e as { code?: string })?.code === "P2002") {
      const row = await db.payment.findUniqueOrThrow({ where: { providerPaymentId: p.providerPaymentId }, select: { id: true } });
      return { paymentId: row.id, created: false };
    }
    throw e;
  }
}

class AlreadyRecorded extends Error {}

/** After a new payment: invoice PDF, events, student notification. Failures here never undo the payment. */
async function afterPayment(paymentId: string, ctx: { discountMinor: number; periodStart: Date | null; periodEnd: Date | null; couponId?: string | null }) {
  let attachment: { filename: string; content: Buffer } | undefined;
  try {
    const inv = await generateInvoiceForPayment(paymentId, { discountMinor: ctx.discountMinor, periodStart: ctx.periodStart, periodEnd: ctx.periodEnd });
    attachment = { filename: inv.filename, content: inv.buffer };
  } catch (e) {
    console.error("[billing] invoice PDF generation failed", paymentId, e);
  }
  if (ctx.couponId) await redeemCoupon(ctx.couponId).catch((e) => console.error("[billing] coupon redeem failed", e));

  const p = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: {
      amountMinor: true,
      currency: true,
      studentId: true,
      student: { select: { userId: true, market: { select: { locale: true } }, user: { select: { timezone: true, name: true } } } },
      subscription: { select: { currentPeriodEnd: true, planPrice: { select: { plan: { select: { name: true } } } } } },
    },
  });
  const end = p.subscription?.currentPeriodEnd ?? ctx.periodEnd;
  await trackEvent("payment_succeeded", p.student.userId, { paymentId, amountMinor: p.amountMinor, currency: p.currency });
  void sendAlert("new_signup_payment", { title: `${p.student.user.name} paid ${formatMoney(p.amountMinor, p.currency, p.student.market.locale)}`, lines: [p.subscription?.planPrice.plan.name ?? "UpayaInd"], link: "/admin/payments", linkLabel: "Open payments" });
  await notify(
    p.student.userId,
    "payment_succeeded",
    {
      amount: formatMoney(p.amountMinor, p.currency, p.student.market.locale),
      plan: p.subscription?.planPrice.plan.name ?? "UpayaInd",
      periodEnd: end ? formatDate(end, p.student.user.timezone) : "—",
    },
    attachment ? { attachments: [attachment] } : {},
  );
  // Referral programme (D-113): credits the referrer once, on the friend's first successful payment.
  await onFirstPaymentSucceeded(p.studentId).catch((e) => console.error("[billing] referral credit failed", paymentId, e));
}

// ───────────────────────────── handlers ─────────────────────────────

async function onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<string> {
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const localId = session.client_reference_id ?? meta.subscriptionId ?? null;
  const providerSubId = idOf(session.subscription);
  const local = await findLocalSubscription({ providerSubId, localId });
  if (!local) return "no local subscription";
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    // Async payment methods: wait for checkout.session.async_payment_succeeded.
    await db.subscription.update({ where: { id: local.id }, data: { providerCustomerId: idOf(session.customer) ?? undefined } });
    return `awaiting payment (${session.payment_status})`;
  }
  const customerId = idOf(session.customer);

  if (session.mode === "subscription") {
    const ps = await resolveProviderSubscription(session.subscription);
    await activate(local.id, {
      periodStart: ps?.periodStart ?? null,
      periodEnd: ps?.periodEnd ?? null,
      providerSubId: ps?.id ?? providerSubId,
      providerCustomerId: customerId,
      cancelAtPeriodEnd: ps?.cancelAtPeriodEnd,
    });
    // The first invoice is usually delivered as invoice.paid too; processing it
    // here as well makes activation independent of event order (idempotent).
    if (session.invoice && typeof session.invoice !== "string") await onInvoicePaid(session.invoice, meta.couponId);
    else if (typeof session.invoice === "string") {
      try {
        const { stripeClient } = await import("./stripe");
        const inv = await stripeClient().invoices.retrieve(session.invoice);
        if (inv.status === "paid") await onInvoicePaid(inv, meta.couponId);
      } catch (e) {
        // invoice.paid will arrive separately and record the payment.
        console.warn("[billing] could not fetch first invoice; relying on invoice.paid", e);
      }
    }
    return "subscription activated";
  }

  // mode=payment → ONE_TIME plan: period = now + plan interval months.
  const sub = await db.subscription.findUniqueOrThrow({ where: { id: local.id }, select: { planPrice: { select: { interval: true } } } });
  const paidAt = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000);
  const periodStart = local.status === "ACTIVE" && local.currentPeriodEnd && local.currentPeriodEnd > paidAt ? local.currentPeriodEnd : paidAt;
  const months = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12, ONE_TIME: 1 }[sub.planPrice.interval];
  const periodEnd = addMonths(periodStart, months);
  const providerPaymentId = idOf(session.payment_intent) ?? session.id;
  const already = await db.payment.findUnique({ where: { providerPaymentId }, select: { status: true } });
  if (already?.status === "SUCCEEDED" || already?.status === "REFUNDED" || already?.status === "PARTIALLY_REFUNDED") return "duplicate payment";

  await activate(local.id, { periodStart, periodEnd, providerCustomerId: customerId });
  const discountMinor = session.total_details?.amount_discount ?? 0;
  const pay = await recordSuccessfulPayment({
    subscriptionId: local.id,
    studentId: local.studentId,
    providerPaymentId,
    provider: "STRIPE",
    amountMinor: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    taxMinor: session.total_details?.amount_tax ?? 0,
    discountMinor,
    paidAt,
    periodStart,
    periodEnd,
  });
  if (pay.created) await afterPayment(pay.paymentId, { discountMinor, periodStart, periodEnd, couponId: meta.couponId });
  return "one-time payment recorded";
}

async function onInvoicePaid(inv: Stripe.Invoice, couponIdHint?: string): Promise<string> {
  const ref = invoiceSubscriptionRef(inv);
  if (!ref.subId && !ref.metadata.subscriptionId) return "not a subscription invoice";
  const local = await findLocalSubscription({ providerSubId: ref.subId, localId: ref.metadata.subscriptionId });
  if (!local) return "no local subscription";

  let { start, end } = invoicePeriod(inv);
  if (!end) {
    const ps = await resolveProviderSubscription(ref.sub);
    start = ps?.periodStart ?? null;
    end = ps?.periodEnd ?? null;
  }
  await activate(local.id, { periodStart: start, periodEnd: end, providerSubId: ref.subId, providerCustomerId: idOf(inv.customer) });

  const paidAtUnix = inv.status_transitions?.paid_at ?? inv.created;
  const discountMinor = sumDiscounts(inv);
  const pay = await recordSuccessfulPayment({
    subscriptionId: local.id,
    studentId: local.studentId,
    providerPaymentId: inv.id!,
    provider: "STRIPE",
    amountMinor: inv.amount_paid,
    currency: inv.currency,
    taxMinor: sumTaxes(inv),
    discountMinor,
    paidAt: new Date(paidAtUnix * 1000),
    periodStart: start,
    periodEnd: end,
  });
  const isFirst = inv.billing_reason === "subscription_create";
  if (pay.created) await afterPayment(pay.paymentId, { discountMinor, periodStart: start, periodEnd: end, couponId: isFirst ? (couponIdHint ?? ref.metadata.couponId) : null });
  return pay.created ? "payment recorded" : "payment already recorded";
}

async function onInvoiceFailed(inv: Stripe.Invoice): Promise<string> {
  const ref = invoiceSubscriptionRef(inv);
  const local = await findLocalSubscription({ providerSubId: ref.subId, localId: ref.metadata.subscriptionId });
  if (!local) return "no local subscription";

  const reason = inv.last_finalization_error?.message ?? (inv.attempt_count ? `Payment attempt ${inv.attempt_count} was declined` : "Payment was declined");
  if (local.status === "ACTIVE" || local.status === "PAST_DUE") {
    await db.subscription.update({ where: { id: local.id }, data: { status: "PAST_DUE" } });
    if (local.status === "ACTIVE") await audit({ action: "subscription.past_due", entity: "Subscription", entityId: local.id, before: { status: "ACTIVE" }, after: { status: "PAST_DUE", reason } });
  }
  const existing = await db.payment.findUnique({ where: { providerPaymentId: inv.id! }, select: { id: true, status: true } });
  if (existing?.status === "SUCCEEDED") return "invoice already paid";
  if (existing) await db.payment.update({ where: { id: existing.id }, data: { status: "FAILED", failureReason: reason } });
  else {
    await db.payment.create({
      data: {
        subscriptionId: local.id,
        studentId: local.studentId,
        amountMinor: inv.amount_due,
        currency: inv.currency.toUpperCase(),
        status: "FAILED",
        provider: "STRIPE",
        providerPaymentId: inv.id!,
        failureReason: reason,
      },
    });
  }

  const s = await db.studentProfile.findUniqueOrThrow({
    where: { id: local.studentId },
    select: { id: true, userId: true, user: { select: { name: true } }, market: { select: { locale: true } } },
  });
  const plan = await db.planPrice.findUnique({ where: { id: local.planPriceId }, select: { plan: { select: { name: true } } } });
  const amount = formatMoney(inv.amount_due, inv.currency.toUpperCase(), s.market.locale);
  await notify(s.userId, "payment_failed", { amount, plan: plan?.plan.name });
  await notifyManagers("payment_failed_admin", { student: s.user.name, studentId: s.id, amount, plan: plan?.plan.name ?? "—", reason });
  void sendAlert("payment_failed", { title: s.user.name, lines: [`${amount} · ${plan?.plan.name ?? "—"}`, `Reason: ${reason || "unknown"}`], link: `/admin/students/${s.id}`, linkLabel: "Open student" });
  return "payment failure recorded";
}

function mapStatus(stripeStatus: string): SubscriptionStatus | null {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "paused":
      return "PAUSED";
    case "canceled":
      return "CANCELED";
    case "incomplete_expired":
      return "EXPIRED";
    default:
      return null; // incomplete: wait for payment
  }
}

async function onSubscriptionChanged(raw: Stripe.Subscription, deleted: boolean): Promise<string> {
  const ps = normaliseStripeSubscription(raw);
  const local = await findLocalSubscription({ providerSubId: ps.id, localId: ps.metadata.subscriptionId });
  if (!local) return "no local subscription";

  let status = deleted ? ("CANCELED" as const) : mapStatus(ps.status);
  // Activation needs a recorded payment (checkout / invoice.paid). A status
  // update never moves a never-paid subscription to ACTIVE on its own.
  if (status === "ACTIVE" && local.status === "PENDING_PAYMENT") status = null;
  // An admin pause (D-121) keeps Stripe's status "active" (pause_collection); don't let a sync un-pause it.
  if (status === "ACTIVE" && local.status === "PAUSED" && local.pausedAt) status = null;

  // Upgrade/downgrade from the customer portal: follow the new price.
  let planPriceId: string | undefined;
  if (ps.priceId) {
    const pp = await db.planPrice.findFirst({ where: { providerPriceId: ps.priceId }, select: { id: true } });
    if (pp && pp.id !== local.planPriceId) planPriceId = pp.id;
  }

  const data: Prisma.SubscriptionUpdateInput = {
    providerSubId: ps.id,
    cancelAtPeriodEnd: deleted ? false : ps.cancelAtPeriodEnd,
    ...(status ? { status } : {}),
    ...(ps.periodStart ? { currentPeriodStart: ps.periodStart } : {}),
    ...(ps.periodEnd ? { currentPeriodEnd: ps.periodEnd } : {}),
    ...(planPriceId ? { planPrice: { connect: { id: planPriceId } } } : {}),
  };
  if (ps.periodEnd && local.currentPeriodEnd?.getTime() !== ps.periodEnd.getTime()) data.remindersSent = [];
  await db.subscription.update({ where: { id: local.id }, data });
  if ((status && status !== local.status) || planPriceId) {
    await audit({
      action: deleted ? "subscription.cancel" : "subscription.sync",
      entity: "Subscription",
      entityId: local.id,
      before: { status: local.status, planPriceId: local.planPriceId },
      after: { status: status ?? local.status, planPriceId: planPriceId ?? local.planPriceId, cancelAtPeriodEnd: ps.cancelAtPeriodEnd },
    });
  }
  // Re-activation after a past-due period (payment method updated in the portal).
  if (status === "ACTIVE" && local.status !== "ACTIVE") await emit("subscription.activated", { studentId: local.studentId });
  return deleted ? "subscription canceled" : `subscription synced (${status ?? local.status})`;
}
