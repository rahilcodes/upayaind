import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/env";
import { absoluteUrl } from "@/lib/utils";
import { safeEqual } from "@/server/crypto";
import { BillingError, type CheckoutSessionInput, type PaymentProvider, type ProviderEvent } from "./types";

/**
 * Razorpay (India, D-159). Indian packages are single payments that run for
 * one period (90 days), so checkout is an Order + Razorpay Checkout.js — no
 * gateway subscription, no customer portal. Activation happens through the
 * shared webhook processor (`payment.captured`), either from the webhook or
 * from the browser's signed success callback (`confirmRazorpayPayment`), whichever
 * arrives first; both are idempotent on the payment id.
 *
 * Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (dashboard → Settings → API keys),
 * RAZORPAY_WEBHOOK_SECRET (dashboard → Settings → Webhooks; URL /api/webhooks/razorpay).
 */

const API = "https://api.razorpay.com/v1";

export function razorpayConfigured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string; receipt?: string | null; notes?: Record<string, string> | null };
export type RazorpayPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed" | string;
  method?: string | null;
  email?: string | null;
  contact?: string | null;
  notes?: Record<string, string> | null;
  created_at: number;
  captured?: boolean;
};

/** Minimal REST client (no SDK): Basic auth with key id / secret. */
export async function rzp<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  if (!razorpayConfigured()) throw new BillingError("Online payments for India aren’t set up yet. Please contact us to complete your purchase.");
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const r = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...(init.idempotencyKey ? { "X-Razorpay-Idempotency-Key": init.idempotencyKey } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await r.text();
  type ErrBody = { error?: { description?: string } };
  let json: ErrBody | null = null;
  try {
    json = text ? (JSON.parse(text) as ErrBody) : null;
  } catch {
    json = null;
  }
  if (!r.ok) {
    const msg = json?.error?.description ?? `HTTP ${r.status}`;
    console.error("[razorpay]", init.method ?? "GET", path, r.status, msg);
    throw new BillingError(`Payment service error: ${msg}`);
  }
  return json as T;
}

/** Checkout.js success callback: HMAC-SHA256(order_id|payment_id, key secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string | null | undefined) {
  if (!env.RAZORPAY_KEY_SECRET || !signature) return false;
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
  return expected.length === signature.length && safeEqual(expected, signature);
}

/** Webhook: HMAC-SHA256(raw body, webhook secret) in `X-Razorpay-Signature`. */
export function verifyWebhookSignature(rawBody: string, signature: string | null | undefined, secret = env.RAZORPAY_WEBHOOK_SECRET) {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected.length === signature.length && safeEqual(expected, signature);
}

/** A Razorpay payment as the shared processor's event. The id makes webhook + browser confirmation idempotent. */
export function paymentToEvent(p: RazorpayPayment, type = "payment.captured"): ProviderEvent {
  return { id: `rzp_${type}_${p.id}`, type, created: p.created_at, data: { object: p } };
}

export const razorpayProvider: PaymentProvider = {
  code: "RAZORPAY",

  isConfigured: razorpayConfigured,

  /** One Order per checkout; the coupon discount is already applied to the amount (no Razorpay offer objects). */
  async createCheckoutSession(input: CheckoutSessionInput) {
    const amount = input.line.amountMinor - (input.discountMinor ?? 0);
    if (amount < 100) throw new BillingError("This amount is too small to charge online. Please contact us.");
    const order = await rzp<RazorpayOrder>("/orders", {
      method: "POST",
      idempotencyKey: `order_${input.localSubscriptionId}_${amount}`,
      body: {
        amount,
        currency: input.line.currency.toUpperCase(),
        receipt: input.localSubscriptionId.slice(0, 40),
        payment_capture: 1,
        notes: { ...input.metadata, discountMinor: String(input.discountMinor ?? 0), productName: input.line.productName.slice(0, 200), email: input.customerEmail.slice(0, 200) },
      },
    });
    return { id: order.id, url: absoluteUrl(`/app/checkout/razorpay?order=${encodeURIComponent(order.id)}`) };
  },

  async createPortalSession() {
    throw new BillingError("Razorpay plans are single payments with no self-service portal. Your plan runs for the period you paid for; buy again from the pricing page to extend it.");
  },

  async refund({ providerPaymentId, amountMinor, reason, idempotencyKey }) {
    const r = await rzp<{ id: string }>(`/payments/${providerPaymentId}/refund`, {
      method: "POST",
      idempotencyKey,
      body: { amount: amountMinor, speed: "normal", ...(reason ? { notes: { note: reason.slice(0, 450) } } : {}) },
    });
    return { refundId: r.id };
  },

  async createPrice() {
    throw new BillingError("Razorpay doesn’t use price objects: the amount is sent with each order. Nothing to create.");
  },

  async createCoupon(input) {
    // Discounts are applied to the order amount server-side; nothing exists on the Razorpay side.
    return { couponId: `rzp_local_${input.code}` };
  },

  async retrieveSubscription() {
    throw new BillingError("Razorpay plans are single payments; there is no gateway subscription to fetch.");
  },

  async applyCredit() {
    throw new BillingError("Credits can’t be applied to Razorpay accounts automatically. Record a manual adjustment instead.");
  },

  // Nothing to pause at the gateway: the plan is a one-off payment for a fixed period.
  async pauseSubscription() {},
  async resumeSubscription() {},

  async verifyWebhook(rawBody: string, signature: string | null): Promise<ProviderEvent> {
    if (!verifyWebhookSignature(rawBody, signature)) throw new BillingError("Invalid Razorpay webhook signature.");
    const body = JSON.parse(rawBody) as { event: string; created_at: number; payload?: { payment?: { entity: RazorpayPayment } } };
    const p = body.payload?.payment?.entity;
    if (p) return paymentToEvent(p, body.event);
    return { id: `rzp_${body.event}_${body.created_at}`, type: body.event, created: body.created_at, data: { object: body.payload ?? {} } };
  },
};
