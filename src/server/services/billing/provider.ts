import "server-only";
import { razorpayProvider } from "./razorpay";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

/** Pick the gateway for a market (`Market.paymentProvider`). Unknown values fall back to Stripe. */
export function providerFor(code: string | null | undefined): PaymentProvider {
  return code?.toUpperCase() === "RAZORPAY" ? razorpayProvider : stripeProvider;
}

/**
 * Does this gateway charge the customer again by itself at the end of a period?
 * Stripe: yes (subscriptions). Razorpay (D-159/D-168) and MANUAL: no — one payment
 * buys one period and the student renews by paying again.
 */
export function gatewayAutoRenews(code: string | null | undefined) {
  return (code ?? "STRIPE").toUpperCase() === "STRIPE";
}

/**
 * Dev-only "simulate payment" (D-021 in docs/DECISIONS.md): allowed only
 * outside production AND when the gateway's keys are absent. The simulated flow
 * runs the real webhook processing code with a synthetic event.
 */
export function simulationEnabled(provider: PaymentProvider = stripeProvider) {
  if (provider.isConfigured()) return false;
  // CI runs e2e against a production build without Stripe keys; it opts in explicitly.
  return process.env.NODE_ENV !== "production" || process.env.E2E_ALLOW_PAYMENT_SIMULATION === "1";
}
