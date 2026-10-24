"use server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireAction } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import {
  cancelAtPeriodEnd,
  cancelAtPeriodEndSchema,
  changePlan,
  changePlanSchema,
  grantPlan,
  grantPlanSchema,
  listGrantablePrices,
  manualPaymentSchema,
  recordManualPayment,
  setPeriodSchema,
  setStatusSchema,
  setSubscriptionPeriod,
  setSubscriptionStatus,
} from "@/server/services/billing/manual";

/**
 * Student 360 → billing tab (D-147b). ADMIN only (`billing.manage`). Dates
 * arrive as ISO strings from the client and are coerced by the shared schemas.
 */

export async function listGrantablePricesAction(marketId: string) {
  return safeAction(async () => {
    await requireAction("billing.manage");
    return listGrantablePrices(z.string().min(1).max(64).parse(marketId));
  });
}

export async function grantPlanAction(input: z.input<typeof grantPlanSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("billing.manage");
    return grantPlan({ id: user.id, role: user.role }, input);
  }, t("planGranted"));
}

export async function changePlanAction(input: z.input<typeof changePlanSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("billing.manage");
    return changePlan({ id: user.id, role: user.role }, input);
  }, t("planChanged"));
}

export async function setSubscriptionPeriodAction(input: z.input<typeof setPeriodSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("billing.manage");
    return setSubscriptionPeriod({ id: user.id, role: user.role }, input);
  }, t("periodSaved"));
}

export async function setSubscriptionStatusAction(input: z.input<typeof setStatusSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("billing.manage");
    return setSubscriptionStatus({ id: user.id, role: user.role }, input);
  }, t("statusSaved"));
}

export async function cancelAtPeriodEndAction(input: z.input<typeof cancelAtPeriodEndSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("billing.manage");
    return cancelAtPeriodEnd({ id: user.id, role: user.role }, input);
  }, t(input.cancel ? "cancelAtEndSet" : "cancelAtEndCleared"));
}

export async function recordManualPaymentAction(input: z.input<typeof manualPaymentSchema>) {
  const t = await getTranslations("admin.toasts");
  return safeAction(async () => {
    const user = await requireAction("billing.manage");
    return recordManualPayment({ id: user.id, role: user.role }, input);
  }, t("paymentRecorded"));
}
