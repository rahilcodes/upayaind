"use server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { archivePlan, createProviderPrice, planInputSchema, priceInputSchema, savePlan, savePrice, setPriceActive, type PlanInput, type PriceInput } from "@/server/services/billing";

const id = z.string().min(1).max(64);

export async function savePlanAction(input: PlanInput) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    planInputSchema.parse(input);
    const p = await savePlan(user.id, input);
    return { id: p.id };
  }, (await getTranslations("billing.admin.toasts"))("planSaved"));
}

export async function archivePlanAction(planId: string) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    await archivePlan(user.id, id.parse(planId));
    return null;
  }, (await getTranslations("billing.admin.toasts"))("planArchived"));
}

export async function savePriceAction(input: PriceInput) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    priceInputSchema.parse(input);
    const p = await savePrice(user.id, input);
    return { id: p.id };
  }, (await getTranslations("billing.admin.toasts"))("priceSaved"));
}

export async function togglePriceAction(priceId: string, isActive: boolean) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    const v = z.object({ id, isActive: z.boolean() }).parse({ id: priceId, isActive });
    await setPriceActive(user.id, v.id, v.isActive);
    return null;
  }, (await getTranslations("billing.admin.toasts"))("priceToggled"));
}

export async function createStripePriceAction(priceId: string) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    const p = await createProviderPrice(user.id, id.parse(priceId));
    return { providerPriceId: p.providerPriceId };
  }, (await getTranslations("billing.admin.toasts"))("stripePriceCreated"));
}
