import "server-only";
import type { BillingInterval } from "@/generated/prisma/enums";

/** User-safe billing error (shown as a toast / form error via safeAction). */
export class BillingError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export type ProviderCode = "STRIPE" | "RAZORPAY";

/** A webhook event after signature verification. Stripe's shape is the canonical one. */
export type ProviderEvent = {
  id: string;
  type: string;
  created: number;
  livemode?: boolean;
  data: { object: unknown };
};

export type CheckoutSessionInput = {
  mode: "subscription" | "payment";
  localSubscriptionId: string;
  studentId: string;
  planPriceId: string;
  customerId?: string | null;
  customerEmail: string;
  line: {
    providerPriceId?: string | null;
    amountMinor: number;
    currency: string;
    productName: string;
    interval: BillingInterval;
  };
  providerCouponId?: string | null;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

export type CreatePriceInput = {
  planCode: string;
  planName: string;
  marketCode: string;
  planPriceId: string;
  interval: BillingInterval;
  amountMinor: number;
  currency: string;
};

export type CreateCouponInput = {
  code: string;
  percentOff?: number | null;
  amountOffMinor?: number | null;
  currency?: string | null;
  maxRedemptions?: number | null;
  validTo?: Date | null;
};

/** Normalised provider subscription (period + flags) used by the sync code. */
export type ProviderSubscription = {
  id: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodStart: Date | null;
  periodEnd: Date | null;
  priceId: string | null;
  metadata: Record<string, string>;
};

/**
 * Payment gateway abstraction (SPEC §4: "Behind a PaymentProvider interface,
 * chosen per market"). Stripe is the launch provider; Razorpay is P1.
 */
export interface PaymentProvider {
  readonly code: ProviderCode;
  /** True when API keys are present. */
  isConfigured(): boolean;
  createCheckoutSession(input: CheckoutSessionInput): Promise<{ id: string; url: string }>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  refund(input: { providerPaymentId: string; amountMinor: number; reason?: string | null; idempotencyKey: string }): Promise<{ refundId: string }>;
  createPrice(input: CreatePriceInput): Promise<{ priceId: string }>;
  createCoupon(input: CreateCouponInput): Promise<{ couponId: string }>;
  retrieveSubscription(id: string): Promise<ProviderSubscription>;
  /** Verify a webhook signature and return the parsed event. Throws on a bad signature. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<ProviderEvent>;
}

/** Stripe recurring settings per billing interval. */
export const STRIPE_RECURRING: Record<Exclude<BillingInterval, "ONE_TIME">, { interval: "month" | "year"; interval_count: number }> = {
  MONTHLY: { interval: "month", interval_count: 1 },
  QUARTERLY: { interval: "month", interval_count: 3 },
  HALF_YEARLY: { interval: "month", interval_count: 6 },
  YEARLY: { interval: "year", interval_count: 1 },
};
