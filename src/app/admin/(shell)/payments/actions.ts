"use server";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { requestMeta } from "@/server/request";
import { refundInputSchema, refundPayment } from "@/server/services/billing";

/** Full or partial refund (ADMIN only; managers can only view payments — SPEC §3). */
export async function refundPaymentAction(paymentId: string, amountMinor: number, reason: string) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    const input = refundInputSchema.parse({ paymentId, amountMinor, reason });
    const { ip } = await requestMeta();
    return refundPayment(user, input, { ip });
  }, (await getTranslations("billing.admin.toasts"))("refunded"));
}
