import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { paymentToEvent, rzp, verifyCheckoutSignature, type RazorpayOrder, type RazorpayPayment } from "./razorpay";
import { BillingError } from "./types";
import { processWebhookEvent } from "./webhooks";

/**
 * Razorpay checkout page data + the browser success callback (D-159). The
 * callback carries a signature over order_id|payment_id; we verify it, fetch
 * the payment from Razorpay (never trust amounts from the browser) and run the
 * same idempotent processor the webhook uses. If the webhook already did it,
 * this is a no-op ("duplicate").
 */

export const confirmSchema = z.object({
  orderId: z.string().min(1).max(64),
  paymentId: z.string().min(1).max(64),
  signature: z.string().min(1).max(256),
});

/** What the /app/checkout/razorpay page needs for Checkout.js. Only the student's own pending order. */
export async function razorpayCheckoutData(studentId: string, orderId: string) {
  const sub = await db.subscription.findFirst({
    where: { studentId, providerSubId: orderId, provider: "RAZORPAY" },
    select: { id: true, status: true, planPrice: { select: { currency: true, interval: true, plan: { select: { name: true } } } }, student: { select: { user: { select: { name: true, email: true, phone: true } } } } },
  });
  if (!sub) return null;
  if (sub.status !== "PENDING_PAYMENT") return { paid: true as const, subscriptionId: sub.id };
  const order = await rzp<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`);
  return {
    paid: false as const,
    subscriptionId: sub.id,
    orderId: order.id,
    amountMinor: order.amount,
    currency: order.currency,
    planName: sub.planPrice.plan.name,
    interval: sub.planPrice.interval,
    name: sub.student.user.name,
    email: sub.student.user.email,
    phone: sub.student.user.phone,
  };
}

export async function confirmRazorpayPayment(s: { studentId: string }, raw: z.input<typeof confirmSchema>) {
  const v = confirmSchema.parse(raw);
  if (!verifyCheckoutSignature(v.orderId, v.paymentId, v.signature)) {
    throw new BillingError("We couldn’t verify this payment. If money was deducted, your plan will be activated automatically within a few minutes.");
  }
  const sub = await db.subscription.findFirst({ where: { studentId: s.studentId, providerSubId: v.orderId }, select: { id: true } });
  if (!sub) throw new BillingError("This order doesn’t belong to your account.");

  let payment = await rzp<RazorpayPayment>(`/payments/${encodeURIComponent(v.paymentId)}`);
  if (payment.order_id !== v.orderId) throw new BillingError("This payment doesn’t match the order.");
  if (payment.status === "authorized") {
    // Orders are created with payment_capture=1, but capture it ourselves if the account is set to manual capture.
    payment = await rzp<RazorpayPayment>(`/payments/${encodeURIComponent(v.paymentId)}/capture`, { method: "POST", body: { amount: payment.amount, currency: payment.currency } });
  }
  if (payment.status !== "captured") throw new BillingError(`The payment is ${payment.status}. If money was deducted, it will be reconciled automatically.`);

  const r = await processWebhookEvent("RAZORPAY", paymentToEvent(payment));
  return { status: r.status, subscriptionId: sub.id };
}
