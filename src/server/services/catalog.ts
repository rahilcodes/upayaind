import "server-only";
import type { BillingInterval } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/** Months per billing interval (for "save X%" and period math). */
export const INTERVAL_MONTHS: Record<BillingInterval, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
  ONE_TIME: 1,
};

export const INTERVAL_ORDER: BillingInterval[] = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "ONE_TIME"];

export async function listSignupMarkets() {
  return db.market.findMany({
    where: { isActive: true },
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getMarketByCode(code: string | undefined | null) {
  const m = code
    ? await db.market.findFirst({ where: { code: code.toUpperCase(), isActive: true } })
    : null;
  return m ?? (await db.market.findFirst({ where: { code: "US" } })) ?? (await db.market.findFirst({ where: { isActive: true } }));
}

export async function getPlanPriceSummary(planPriceId: string) {
  const pp = await db.planPrice.findFirst({
    where: { id: planPriceId, isActive: true, plan: { isActive: true, deletedAt: null } },
    select: { id: true, interval: true, plan: { select: { name: true } }, market: { select: { code: true } } },
  });
  if (!pp) return null;
  const intervalLabel = { MONTHLY: "monthly", QUARTERLY: "quarterly", HALF_YEARLY: "6 months", YEARLY: "yearly", ONE_TIME: "one-time" }[pp.interval];
  return { id: pp.id, label: `${pp.plan.name} (${intervalLabel})`, marketCode: pp.market.code };
}

export type PricingPlan = {
  planId: string;
  code: string;
  name: string;
  description: string | null;
  features: string[];
  isFeatured: boolean;
  prices: {
    id: string;
    interval: BillingInterval;
    amountMinor: number;
    currency: string;
    dailyTarget: number;
    interviewsPromise: string | null;
    perMonthMinor: number;
    savingPct: number;
    purchasable: boolean;
  }[];
};

/**
 * Plans for a market (SPEC §6.3): only intervals that exist; saving % computed
 * against that plan's monthly price; prices below the market floor are never
 * shown as purchasable (placeholders are blocked until set).
 */
export async function getPricing(marketCode: string | null | undefined) {
  const market = await getMarketByCode(marketCode);
  if (!market) return { market: null, plans: [] as PricingPlan[], intervals: [] as BillingInterval[] };
  const plans = await db.plan.findMany({
    where: { isActive: true, deletedAt: null, prices: { some: { marketId: market.id, isActive: true } } },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      features: true,
      isFeatured: true,
      prices: {
        where: { marketId: market.id, isActive: true },
        select: { id: true, interval: true, amountMinor: true, currency: true, dailyTarget: true, interviewsPromise: true },
      },
    },
  });
  const intervals = new Set<BillingInterval>();
  const out: PricingPlan[] = plans.map((p) => {
    const monthly = p.prices.find((x) => x.interval === "MONTHLY");
    return {
      planId: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      features: p.features,
      isFeatured: p.isFeatured,
      prices: p.prices
        .sort((a, b) => INTERVAL_ORDER.indexOf(a.interval) - INTERVAL_ORDER.indexOf(b.interval))
        .map((x) => {
          intervals.add(x.interval);
          const months = INTERVAL_MONTHS[x.interval];
          // Whole major units (₹4,333 a month, not ₹4,999.67): a marketing figure, not an invoice line.
          const perMonthMinor = Math.round(x.amountMinor / months / 100) * 100;
          const savingPct =
            monthly && x.interval !== "MONTHLY" && x.interval !== "ONE_TIME" && monthly.amountMinor > 0
              ? Math.max(0, Math.round((1 - x.amountMinor / (monthly.amountMinor * months)) * 100))
              : 0;
          return { ...x, perMonthMinor, savingPct, purchasable: x.amountMinor >= market.minPriceMinor };
        }),
    };
  });
  return {
    market: { id: market.id, code: market.code, name: market.name, currency: market.currency, locale: market.locale, phoneDisplay: market.phoneDisplay, whatsapp: market.whatsapp },
    plans: out,
    intervals: INTERVAL_ORDER.filter((i) => intervals.has(i)),
  };
}
