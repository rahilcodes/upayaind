"use server";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { completeSimulatedCheckout, getCheckoutQuote, startCheckout } from "@/server/services/billing";

const couponSchema = z.object({ planPriceId: z.string().min(1).max(64), coupon: z.string().trim().min(1, "Enter a coupon code").max(40) });

/** Preview a coupon on the checkout summary. */
export async function applyCouponAction(planPriceId: string, coupon: string) {
  return safeAction(async () => {
    const { user, student } = await requireStudent();
    const input = couponSchema.parse({ planPriceId, coupon });
    const q = await getCheckoutQuote({ userId: user.id, studentId: student.id }, input.planPriceId, input.coupon);
    return { code: q.coupon!.code, discountMinor: q.coupon!.discountMinor, totalMinor: q.totalMinor };
  });
}

/** Start checkout → provider URL (or the dev-only simulation step). Never activates anything. */
export async function startCheckoutAction(planPriceId: string, coupon: string | null) {
  return safeAction(async () => {
    const { user, student } = await requireStudent();
    return startCheckout({ userId: user.id, studentId: student.id, email: user.email }, { planPriceId, coupon: coupon ?? undefined });
  });
}

/** Dev only: run the real webhook processing with a synthetic "paid" event. */
export async function simulatePaymentAction(subscriptionId: string, coupon: string | null) {
  return safeAction(async () => {
    const { user, student } = await requireStudent();
    const r = await completeSimulatedCheckout({ userId: user.id, studentId: student.id }, { subscriptionId, coupon: coupon ?? undefined });
    return { status: r.status };
  });
}
