import "server-only";
import Stripe from "stripe";
import { env } from "@/env";
import { BillingError, STRIPE_RECURRING, type CheckoutSessionInput, type CreateCouponInput, type CreatePriceInput, type PaymentProvider, type ProviderEvent, type ProviderSubscription } from "./types";

let client: Stripe | null = null;

/** Lazily created Stripe client (package default API version). */
export function stripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new BillingError("Online payments aren’t set up yet. Please contact support to complete your purchase.");
  client ??= new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: "UpayaInd" }, maxNetworkRetries: 2 });
  return client;
}

const ts = (n: number | null | undefined) => (typeof n === "number" ? new Date(n * 1000) : null);

/** Normalise a Stripe subscription. Since API 2025-03 the period lives on the items. */
export function normaliseStripeSubscription(sub: Stripe.Subscription): ProviderSubscription {
  const items = sub.items?.data ?? [];
  const starts = items.map((i) => i.current_period_start).filter((n): n is number => typeof n === "number");
  const ends = items.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number };
  return {
    id: sub.id,
    status: sub.status,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    periodStart: ts(starts.length ? Math.max(...starts) : legacy.current_period_start),
    periodEnd: ts(ends.length ? Math.min(...ends) : legacy.current_period_end),
    priceId: items[0]?.price?.id ?? null,
    metadata: (sub.metadata ?? {}) as Record<string, string>,
  };
}

function wrap(e: unknown): never {
  if (e instanceof BillingError) throw e;
  if (e instanceof Stripe.errors.StripeError) {
    console.error("[stripe] api error", { type: e.type, code: e.code, message: e.message, requestId: e.requestId });
    if (e.type === "StripeCardError" || e.type === "StripeInvalidRequestError") throw new BillingError(`Payment provider: ${e.message}`);
    throw new BillingError("The payment provider is unavailable right now. Please try again in a minute.");
  }
  throw e;
}

export const stripeProvider: PaymentProvider = {
  code: "STRIPE",

  isConfigured: () => Boolean(env.STRIPE_SECRET_KEY),

  async createCheckoutSession(input: CheckoutSessionInput) {
    const stripe = stripeClient();
    const { line } = input;
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = line.providerPriceId
      ? { price: line.providerPriceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: line.currency.toLowerCase(),
            unit_amount: line.amountMinor,
            product_data: { name: line.productName },
            ...(input.mode === "subscription" && line.interval !== "ONE_TIME" ? { recurring: STRIPE_RECURRING[line.interval] } : {}),
          },
        };
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: input.mode,
      line_items: [lineItem],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.localSubscriptionId,
      metadata: input.metadata,
      ...(input.customerId ? { customer: input.customerId } : { customer_email: input.customerEmail }),
      ...(input.providerCouponId ? { discounts: [{ coupon: input.providerCouponId }] } : {}),
      ...(input.mode === "subscription"
        ? { subscription_data: { metadata: input.metadata } }
        : { customer_creation: input.customerId ? undefined : "always", payment_intent_data: { metadata: input.metadata }, invoice_creation: { enabled: true, invoice_data: { metadata: input.metadata } } }),
    };
    try {
      const s = await stripe.checkout.sessions.create(params, { idempotencyKey: `checkout_${input.localSubscriptionId}_${input.providerCouponId ?? "none"}` });
      if (!s.url) throw new BillingError("Couldn’t start checkout. Please try again.");
      return { id: s.id, url: s.url };
    } catch (e) {
      wrap(e);
    }
  },

  async createPortalSession({ customerId, returnUrl }) {
    try {
      const s = await stripeClient().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return { url: s.url };
    } catch (e) {
      wrap(e);
    }
  },

  async refund({ providerPaymentId, amountMinor, reason, idempotencyKey }) {
    const stripe = stripeClient();
    try {
      // providerPaymentId is the Stripe invoice id (subscriptions) or payment intent id (one-time).
      let paymentIntent: string | undefined;
      let charge: string | undefined;
      if (providerPaymentId.startsWith("pi_")) paymentIntent = providerPaymentId;
      else if (providerPaymentId.startsWith("ch_")) charge = providerPaymentId;
      else if (providerPaymentId.startsWith("in_")) {
        const payments = await stripe.invoicePayments.list({ invoice: providerPaymentId, limit: 5 });
        const paid = payments.data.find((p) => p.status === "paid") ?? payments.data[0];
        const pi = paid?.payment?.payment_intent;
        const ch = paid?.payment?.charge;
        paymentIntent = typeof pi === "string" ? pi : pi?.id;
        charge = typeof ch === "string" ? ch : ch?.id;
      }
      if (!paymentIntent && !charge) throw new BillingError("This payment can’t be refunded automatically. Refund it in the Stripe dashboard.");
      const r = await stripe.refunds.create(
        { amount: amountMinor, ...(paymentIntent ? { payment_intent: paymentIntent } : { charge }), reason: "requested_by_customer", metadata: reason ? { note: reason.slice(0, 450) } : undefined },
        { idempotencyKey },
      );
      return { refundId: r.id };
    } catch (e) {
      wrap(e);
    }
  },

  async createPrice(input: CreatePriceInput) {
    const stripe = stripeClient();
    try {
      const productId = `upy_${input.planCode}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      try {
        await stripe.products.retrieve(productId);
        await stripe.products.update(productId, { name: `UpayaInd ${input.planName}` });
      } catch (e) {
        if (e instanceof Stripe.errors.StripeError && e.statusCode === 404) {
          await stripe.products.create({ id: productId, name: `UpayaInd ${input.planName}`, metadata: { planCode: input.planCode } });
        } else throw e;
      }
      const price = await stripe.prices.create(
        {
          product: productId,
          currency: input.currency.toLowerCase(),
          unit_amount: input.amountMinor,
          nickname: `${input.planName} · ${input.marketCode} · ${input.interval}`,
          metadata: { planPriceId: input.planPriceId, market: input.marketCode, interval: input.interval },
          ...(input.interval !== "ONE_TIME" ? { recurring: STRIPE_RECURRING[input.interval] } : {}),
        },
        { idempotencyKey: `price_${input.planPriceId}_${input.amountMinor}_${input.currency}` },
      );
      return { priceId: price.id };
    } catch (e) {
      wrap(e);
    }
  },

  async createCoupon(input: CreateCouponInput) {
    try {
      const c = await stripeClient().coupons.create({
        name: input.code,
        duration: "once",
        ...(input.percentOff ? { percent_off: input.percentOff } : { amount_off: input.amountOffMinor ?? 0, currency: (input.currency ?? "usd").toLowerCase() }),
        ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
        ...(input.validTo ? { redeem_by: Math.floor(input.validTo.getTime() / 1000) } : {}),
        metadata: { code: input.code },
      });
      return { couponId: c.id };
    } catch (e) {
      wrap(e);
    }
  },

  async retrieveSubscription(id: string) {
    try {
      return normaliseStripeSubscription(await stripeClient().subscriptions.retrieve(id));
    } catch (e) {
      wrap(e);
    }
  },

  async verifyWebhook(rawBody: string, signature: string | null): Promise<ProviderEvent> {
    if (!env.STRIPE_WEBHOOK_SECRET) throw new BillingError("STRIPE_WEBHOOK_SECRET is not configured.");
    if (!signature) throw new BillingError("Missing Stripe-Signature header.");
    const event = await stripeClient().webhooks.constructEventAsync(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    return event as unknown as ProviderEvent;
  },
};
