"use server";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { marketInputSchema, saveMarket, type MarketInput } from "@/server/services/billing";

export async function saveMarketAction(input: MarketInput) {
  return safeAction(async () => {
    const user = await requireRole(["ADMIN"]);
    marketInputSchema.parse(input);
    const m = await saveMarket(user.id, input);
    return { id: m.id };
  }, (await getTranslations("billing.admin.toasts"))("marketSaved"));
}
