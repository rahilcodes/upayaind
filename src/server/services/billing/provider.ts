import "server-only";
import { razorpayProvider } from "./razorpay";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

/** Pick the gateway for a market (`Market.paymentProvider`). Unknown values fall back to Stripe. */
export function providerFor(code: string | null | undefined): PaymentProvider {
  return code?.toUpperCase() === "RAZORPAY" ? razorpayProvider : stripeProvider;
}

/**
 * Dev-only "simulate payment" (D-021 in docs/DECISIONS.md): allowed only
 * outside production AND when Stripe keys are absent. The simulated flow runs
 * the real webhook processing code with a synthetic event.
 */
export function simulationEnabled() {
  return process.env.NODE_ENV !== "production" && !stripeProvider.isConfigured();
}
