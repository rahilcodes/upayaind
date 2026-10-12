"use server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { couponInputSchema, saveCoupon, setCouponActive, syncCouponToProvider, type CouponInput } from "@/server/services/billing";

const id = z.string().min(1).max(64);

export async function saveCouponAction(input: CouponInput) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    couponInputSchema.parse(input);
    const c = await saveCoupon(user.id, input);
    return { id: c.id };
  }, (await getTranslations("billing.admin.toasts"))("couponSaved"));
}

export async function toggleCouponAction(couponId: string, isActive: boolean) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    const v = z.object({ id, isActive: z.boolean() }).parse({ id: couponId, isActive });
    await setCouponActive(user.id, v.id, v.isActive);
    return null;
  }, (await getTranslations("billing.admin.toasts"))("couponToggled"));
}

export async function syncCouponAction(couponId: string) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    await syncCouponToProvider(user.id, id.parse(couponId));
    return null;
  }, (await getTranslations("billing.admin.toasts"))("couponSynced"));
}
