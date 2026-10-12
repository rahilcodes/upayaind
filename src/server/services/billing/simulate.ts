import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { INTERVAL_MONTHS } from "@/server/services/catalog";
import { simulationEnabled } from "./provider";
import { BillingError, STRIPE_RECURRING, type ProviderEvent } from "./types";
import { processWebhookEvent } from "./webhooks";

/**
 * Dev-only simulated payments (docs/DECISIONS.md D-021). Builds synthetic
 * Stripe-shaped events and feeds them to the SAME `processWebhookEvent` used
 * by /api/webhooks/stripe, so the whole F1 flow (activation → invoice →
 * assignment → notifications) runs locally without network access.
 * Also used by unit tests.
 */

const rid = (p: string) => `${p}_sim_${randomBytes(8).toString("hex")}`;
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

function addMonths(d: Date, months: number) {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + months);
  return x;
}

export type SyntheticOptions = { now?: Date; discountMinor?: number; couponId?: string | null };

async function loadPending(subscriptionId: string) {
  const s = await db.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      studentId: true,
      status: true,
      providerSubId: true,
      providerCustomerId: true,
      planPriceId: true,
      planPrice: { select: { id: true, amountMinor: true, currency: true, interval: true, providerPriceId: true } },
    },
  });
  if (!s) throw new BillingError("Checkout not found. Start again from the pricing page.");
  return s;
}

/** Synthetic `checkout.session.completed` (with the first paid invoice inline for subscriptions). */
export async function buildCheckoutCompletedEvent(subscriptionId: string, opts: SyntheticOptions = {}): Promise<ProviderEvent> {
  const s = await loadPending(subscriptionId);
  const now = opts.now ?? new Date();
  const pp = s.planPrice;
  const discount = Math.min(opts.discountMinor ?? 0, pp.amountMinor);
  const total = pp.amountMinor - discount;
  const currency = pp.currency.toLowerCase();
  const customer = s.providerCustomerId ?? `cus_sim_${s.studentId}`;
  const metadata: Record<string, string> = { subscriptionId: s.id, studentId: s.studentId, planPriceId: pp.id, ...(opts.couponId ? { couponId: opts.couponId } : {}) };
  const recurring = pp.interval !== "ONE_TIME";
  const end = addMonths(now, INTERVAL_MONTHS[pp.interval]);

  const session: Record<string, unknown> = {
    id: rid("cs"),
    object: "checkout.session",
    mode: recurring ? "subscription" : "payment",
    client_reference_id: s.id,
    metadata,
    customer,
    payment_status: "paid",
    status: "complete",
    amount_total: total,
    currency,
    created: unix(now),
    total_details: { amount_discount: discount, amount_shipping: 0, amount_tax: 0 },
    subscription: null,
    invoice: null,
    payment_intent: recurring ? null : rid("pi"),
  };
  if (recurring) {
    const subId = s.providerSubId ?? `sub_sim_${s.id}`;
    const subscription = {
      id: subId,
      object: "subscription",
      status: "active",
      customer,
      cancel_at_period_end: false,
      cancel_at: null,
      metadata,
      items: { object: "list", data: [{ id: rid("si"), current_period_start: unix(now), current_period_end: unix(end), price: { id: pp.providerPriceId ?? rid("price"), recurring: STRIPE_RECURRING[pp.interval as keyof typeof STRIPE_RECURRING] } }] },
    };
    session.subscription = subscription;
    session.invoice = syntheticInvoice({ subscription, customer, currency, amount: total, discount, start: now, end, reason: "subscription_create", metadata });
  }
  return { id: rid("evt"), type: "checkout.session.completed", created: unix(now), livemode: false, data: { object: session } };
}

function syntheticInvoice(x: {
  subscription: { id: string } | string;
  customer: string;
  currency: string;
  amount: number;
  discount: number;
  start: Date;
  end: Date;
  reason: string;
  metadata: Record<string, string>;
  paid?: boolean;
}) {
  const paid = x.paid !== false;
  return {
    id: rid("in"),
    object: "invoice",
    customer: x.customer,
    currency: x.currency,
    status: paid ? "paid" : "open",
    amount_paid: paid ? x.amount : 0,
    amount_due: x.amount,
    attempt_count: paid ? 1 : 2,
    billing_reason: x.reason,
    created: unix(x.start),
    status_transitions: { paid_at: paid ? unix(x.start) : null },
    total_discount_amounts: x.discount ? [{ amount: x.discount, discount: "di_sim" }] : [],
    total_taxes: [],
    last_finalization_error: null,
    parent: { type: "subscription_details", subscription_details: { subscription: x.subscription, metadata: x.metadata } },
    lines: { object: "list", data: [{ id: rid("il"), amount: x.amount + x.discount, period: { start: unix(x.start), end: unix(x.end) } }] },
  };
}

/** Synthetic renewal `invoice.paid` for an existing (simulated or real) subscription. */
export async function buildRenewalPaidEvent(subscriptionId: string, opts: { now?: Date } = {}): Promise<ProviderEvent> {
  const s = await db.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    select: { id: true, studentId: true, providerSubId: true, providerCustomerId: true, currentPeriodEnd: true, planPrice: { select: { id: true, amountMinor: true, currency: true, interval: true } } },
  });
  const start = s.currentPeriodEnd ?? opts.now ?? new Date();
  const end = addMonths(start, INTERVAL_MONTHS[s.planPrice.interval]);
  const inv = syntheticInvoice({
    subscription: s.providerSubId ?? `sub_sim_${s.id}`,
    customer: s.providerCustomerId ?? `cus_sim_${s.studentId}`,
    currency: s.planPrice.currency.toLowerCase(),
    amount: s.planPrice.amountMinor,
    discount: 0,
    start,
    end,
    reason: "subscription_cycle",
    metadata: { subscriptionId: s.id },
  });
  return { id: rid("evt"), type: "invoice.paid", created: unix(opts.now ?? new Date()), data: { object: inv } };
}

/** Synthetic `invoice.payment_failed` for a renewal. */
export async function buildPaymentFailedEvent(subscriptionId: string, opts: { now?: Date } = {}): Promise<ProviderEvent> {
  const s = await db.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    select: { id: true, studentId: true, providerSubId: true, providerCustomerId: true, currentPeriodEnd: true, planPrice: { select: { amountMinor: true, currency: true, interval: true } } },
  });
  const start = s.currentPeriodEnd ?? opts.now ?? new Date();
  const inv = syntheticInvoice({
    subscription: s.providerSubId ?? `sub_sim_${s.id}`,
    customer: s.providerCustomerId ?? `cus_sim_${s.studentId}`,
    currency: s.planPrice.currency.toLowerCase(),
    amount: s.planPrice.amountMinor,
    discount: 0,
    start,
    end: addMonths(start, INTERVAL_MONTHS[s.planPrice.interval]),
    reason: "subscription_cycle",
    metadata: { subscriptionId: s.id },
    paid: false,
  });
  return { id: rid("evt"), type: "invoice.payment_failed", created: unix(opts.now ?? new Date()), data: { object: inv } };
}

/** Run a simulated successful checkout through the real webhook processor (dev only). */
export async function simulateCheckoutPayment(subscriptionId: string, opts: SyntheticOptions = {}) {
  if (!simulationEnabled()) throw new BillingError("Simulated payments are only available in development without Stripe keys.");
  const event = await buildCheckoutCompletedEvent(subscriptionId, opts);
  return processWebhookEvent("STRIPE", event);
}
