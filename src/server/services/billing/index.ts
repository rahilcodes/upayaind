import "server-only";
/**
 * Billing (SPEC M2): plans & prices, checkout, webhooks, subscriptions,
 * invoices, refunds and renewal reminders. Provider-specific code lives behind
 * the PaymentProvider interface (./types) — Stripe for the United States, Razorpay for every other market (D-168).
 */
export * from "./types";
export { providerFor, simulationEnabled } from "./provider";
export { processWebhookEvent, type WebhookOutcome } from "./webhooks";
export { startCheckout, getCheckoutQuote, completeSimulatedCheckout, checkoutBlock, checkoutInputSchema, type CheckoutQuote } from "./checkout";
export { getStudentBilling, createPortalSession } from "./account";
export { generateInvoiceForPayment } from "./invoices";
export { nextInvoiceNumber, formatInvoiceNumber } from "./invoice-number";
export { checkCoupon, validateCoupon, listCoupons, saveCoupon, setCouponActive, syncCouponToProvider, couponInputSchema, type CouponInput } from "./coupons";
export * from "./catalog-admin";
export { listPayments, refundPayment, refundInputSchema } from "./payments-admin";
export { runRenewalReminders, runSubscriptionStatusSweep } from "./renewals";
