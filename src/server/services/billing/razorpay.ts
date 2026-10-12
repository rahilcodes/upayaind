import "server-only";
import { BillingError, type PaymentProvider } from "./types";

const unavailable = (): never => {
  throw new BillingError("Payments for this country are not available yet. Please contact us and we’ll help you sign up.");
};

/** Razorpay (India) is P1 (SPEC §17). Every call fails with a clear message until it ships. */
export const razorpayProvider: PaymentProvider = {
  code: "RAZORPAY",
  isConfigured: () => false,
  createCheckoutSession: async () => unavailable(),
  createPortalSession: async () => unavailable(),
  refund: async () => unavailable(),
  createPrice: async () => unavailable(),
  createCoupon: async () => unavailable(),
  retrieveSubscription: async () => unavailable(),
  verifyWebhook: async () => unavailable(),
};
