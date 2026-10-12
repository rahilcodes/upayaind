import "server-only";
import { z } from "zod";
import { BillingInterval } from "@/generated/prisma/enums";
import { formatMoney } from "@/lib/format";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";
import { INTERVAL_ORDER } from "@/server/services/catalog";
import { providerFor } from "./provider";
import { BillingError } from "./types";

/**
 * Admin catalogue (SPEC §11 Plans & pricing, Markets): plans × markets ×
 * intervals with the price-floor guard enforced here (and shown in the UI).
 * Every price change is audit-logged.
 */

// ───────────────────────────── Price floor ─────────────────────────────

/** An ACTIVE price must be ≥ market.minPriceMinor (inactive placeholders are allowed). */
export function assertPriceFloor(p: { amountMinor: number; isActive: boolean }, market: { minPriceMinor: number; currency: string }) {
  if (p.isActive && p.amountMinor < market.minPriceMinor) {
    throw new BillingError(`An active price can’t be below this market’s minimum of ${formatMoney(market.minPriceMinor, market.currency)}. Raise the price or save it as inactive.`, "amountMinor");
  }
}

// ───────────────────────────── Markets ─────────────────────────────

export const marketInputSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a 2-letter country code"),
  name: z.string().trim().min(2, "Enter a name").max(60),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code"),
  locale: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use a locale like en-US"),
  defaultTimezone: z.string().trim().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Pick at least one working day"),
  paymentProvider: z.enum(["STRIPE", "RAZORPAY"]),
  phoneDisplay: z.string().trim().max(40).optional().transform((v) => v || null),
  whatsapp: z.string().trim().max(40).regex(/^\+?[0-9 ]*$/, "Digits only, with country code").optional().transform((v) => v || null),
  minPriceMinor: z.coerce.number().int().min(0, "Can’t be negative"),
  resumeStyleId: z.string().min(1, "Choose a resume style"),
  isActive: z.boolean(),
});
export type MarketInput = z.input<typeof marketInputSchema>;

const MARKET_SELECT = {
  id: true,
  code: true,
  name: true,
  currency: true,
  locale: true,
  defaultTimezone: true,
  workingDays: true,
  paymentProvider: true,
  phoneDisplay: true,
  whatsapp: true,
  minPriceMinor: true,
  resumeStyleId: true,
  isActive: true,
} as const;

export async function listMarketsAdmin() {
  const [markets, styles] = await Promise.all([
    db.market.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { ...MARKET_SELECT, resumeStyle: { select: { name: true } }, _count: { select: { students: true, plans: true } } },
    }),
    db.resumeStyle.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
  ]);
  return { markets, styles };
}

export async function saveMarket(actorId: string, raw: MarketInput) {
  const v = marketInputSchema.parse(raw);
  const { id: _id, ...rest } = v;
  const data = { ...rest, workingDays: [...new Set(v.workingDays)].sort((a, b) => a - b) };
  const clash = await db.market.findUnique({ where: { code: v.code }, select: { id: true } });
  if (clash && clash.id !== v.id) throw new BillingError("A market with this country code already exists.", "code");
  const style = await db.resumeStyle.findUnique({ where: { id: v.resumeStyleId }, select: { id: true } });
  if (!style) throw new BillingError("That resume style doesn’t exist.", "resumeStyleId");

  if (v.id) {
    const before = await db.market.findUnique({ where: { id: v.id }, select: MARKET_SELECT });
    if (!before) throw new BillingError("Market not found.");
    if (before.currency !== v.currency) {
      const used = await db.planPrice.count({ where: { marketId: v.id } });
      if (used) throw new BillingError("The currency can’t change once the market has prices. Create a new market instead.", "currency");
    }
    if (v.minPriceMinor > before.minPriceMinor) {
      const below = await db.planPrice.count({ where: { marketId: v.id, isActive: true, amountMinor: { lt: v.minPriceMinor } } });
      if (below) throw new BillingError(`${below} active price(s) in this market are below the new minimum. Raise or deactivate them first.`, "minPriceMinor");
    }
    const after = await db.market.update({ where: { id: v.id }, data, select: MARKET_SELECT });
    await audit({ actorId, action: "market.update", entity: "Market", entityId: v.id, before, after });
    return after;
  }
  const created = await db.market.create({ data, select: MARKET_SELECT });
  await audit({ actorId, action: "market.create", entity: "Market", entityId: created.id, after: created });
  return created;
}

// ───────────────────────────── Plans ─────────────────────────────

export const planInputSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,30}$/, "Use 2–30 lowercase letters, numbers or dashes"),
  name: z.string().trim().min(2, "Enter a name").max(60),
  description: z.string().trim().max(300).optional().transform((v) => v || null),
  features: z.array(z.string().trim().min(1).max(160)).max(20, "Up to 20 features"),
  isFeatured: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
  isActive: z.boolean(),
});
export type PlanInput = z.input<typeof planInputSchema>;

const PLAN_SELECT = { id: true, code: true, name: true, description: true, features: true, isFeatured: true, sortOrder: true, isActive: true } as const;

export async function savePlan(actorId: string, raw: PlanInput) {
  const v = planInputSchema.parse(raw);
  const { id, ...data } = v;
  const clash = await db.plan.findUnique({ where: { code: v.code }, select: { id: true } });
  if (clash && clash.id !== id) throw new BillingError("A plan with this code already exists.", "code");
  const saved = await db.$transaction(async (tx) => {
    // Only one "Most popular" plan.
    if (v.isFeatured) await tx.plan.updateMany({ where: { isFeatured: true, ...(id ? { id: { not: id } } : {}) }, data: { isFeatured: false } });
    if (id) {
      const before = await tx.plan.findUnique({ where: { id }, select: PLAN_SELECT });
      if (!before) throw new BillingError("Plan not found.");
      const after = await tx.plan.update({ where: { id }, data, select: PLAN_SELECT });
      await audit({ actorId, action: "plan.update", entity: "Plan", entityId: id, before, after }, tx);
      return after;
    }
    const created = await tx.plan.create({ data, select: PLAN_SELECT });
    await audit({ actorId, action: "plan.create", entity: "Plan", entityId: created.id, after: created }, tx);
    return created;
  });
  return saved;
}

export async function archivePlan(actorId: string, id: string) {
  const before = await db.plan.findUnique({ where: { id }, select: PLAN_SELECT });
  if (!before) throw new BillingError("Plan not found.");
  await db.$transaction(async (tx) => {
    await tx.plan.update({ where: { id }, data: { isActive: false, deletedAt: new Date(), isFeatured: false } });
    await tx.planPrice.updateMany({ where: { planId: id }, data: { isActive: false } });
    await audit({ actorId, action: "plan.archive", entity: "Plan", entityId: id, before }, tx);
  });
}

// ───────────────────────────── Prices ─────────────────────────────

export const priceInputSchema = z.object({
  planId: z.string().min(1),
  marketId: z.string().min(1),
  interval: z.enum(BillingInterval),
  amountMinor: z.coerce.number().int().min(0, "Can’t be negative").max(100_000_000, "That amount is too large"),
  dailyTarget: z.coerce.number().int().min(1, "At least 1 application per day").max(500),
  interviewsPromise: z.string().trim().max(60).optional().transform((v) => v || null),
  providerPriceId: z
    .string()
    .trim()
    .max(100)
    .regex(/^(price_[A-Za-z0-9]+)?$/, "Stripe price ids start with price_")
    .optional()
    .transform((v) => v || null),
  isActive: z.boolean(),
});
export type PriceInput = z.input<typeof priceInputSchema>;

const PRICE_SELECT = { id: true, planId: true, marketId: true, interval: true, amountMinor: true, currency: true, dailyTarget: true, interviewsPromise: true, providerPriceId: true, isActive: true } as const;

/** Create/update one cell of the plans × markets × intervals matrix (floor-guarded, audited). */
export async function savePrice(actorId: string, raw: PriceInput) {
  const v = priceInputSchema.parse(raw);
  const [market, plan] = await Promise.all([
    db.market.findUnique({ where: { id: v.marketId }, select: { id: true, currency: true, minPriceMinor: true } }),
    db.plan.findUnique({ where: { id: v.planId }, select: { id: true, deletedAt: true } }),
  ]);
  if (!market) throw new BillingError("Market not found.");
  if (!plan || plan.deletedAt) throw new BillingError("Plan not found.");
  assertPriceFloor(v, market);

  return db.$transaction(async (tx) => {
    const before = await tx.planPrice.findUnique({ where: { planId_marketId_interval: { planId: v.planId, marketId: v.marketId, interval: v.interval } }, select: PRICE_SELECT });
    // Stripe prices are immutable: a new amount needs a new Stripe price.
    const amountChanged = before && before.amountMinor !== v.amountMinor;
    const providerPriceId = amountChanged && v.providerPriceId === before.providerPriceId ? null : v.providerPriceId;
    const data = { amountMinor: v.amountMinor, currency: market.currency, dailyTarget: v.dailyTarget, interviewsPromise: v.interviewsPromise, providerPriceId, isActive: v.isActive };
    const after = before
      ? await tx.planPrice.update({ where: { id: before.id }, data, select: PRICE_SELECT })
      : await tx.planPrice.create({ data: { ...data, planId: v.planId, marketId: v.marketId, interval: v.interval }, select: PRICE_SELECT });
    await audit({ actorId, action: before ? "price.update" : "price.create", entity: "PlanPrice", entityId: after.id, before: before ?? undefined, after }, tx);
    return after;
  });
}

export async function setPriceActive(actorId: string, id: string, isActive: boolean) {
  const before = await db.planPrice.findUnique({ where: { id }, select: { ...PRICE_SELECT, market: { select: { minPriceMinor: true, currency: true } } } });
  if (!before) throw new BillingError("Price not found.");
  assertPriceFloor({ amountMinor: before.amountMinor, isActive }, before.market);
  const after = await db.planPrice.update({ where: { id }, data: { isActive }, select: PRICE_SELECT });
  const { market: _m, ...b } = before;
  await audit({ actorId, action: isActive ? "price.activate" : "price.deactivate", entity: "PlanPrice", entityId: id, before: b, after });
  return after;
}

/** "Create in Stripe" button: creates product + price and stores the price id. */
export async function createProviderPrice(actorId: string, id: string) {
  const pp = await db.planPrice.findUnique({
    where: { id },
    select: { ...PRICE_SELECT, plan: { select: { code: true, name: true } }, market: { select: { code: true, paymentProvider: true, minPriceMinor: true, currency: true } } },
  });
  if (!pp) throw new BillingError("Price not found.");
  if (pp.providerPriceId) throw new BillingError("This price already exists in Stripe.");
  if (pp.amountMinor <= 0 || pp.amountMinor < pp.market.minPriceMinor) throw new BillingError("Set a price at or above the market minimum before creating it in Stripe.");
  const provider = providerFor(pp.market.paymentProvider);
  if (!provider.isConfigured()) throw new BillingError(provider.code === "STRIPE" ? "Stripe isn’t configured (STRIPE_SECRET_KEY is missing)." : "This market’s payment provider isn’t available yet.");
  const { priceId } = await provider.createPrice({
    planCode: pp.plan.code,
    planName: pp.plan.name,
    marketCode: pp.market.code,
    planPriceId: pp.id,
    interval: pp.interval,
    amountMinor: pp.amountMinor,
    currency: pp.currency,
  });
  const after = await db.planPrice.update({ where: { id }, data: { providerPriceId: priceId }, select: PRICE_SELECT });
  await audit({ actorId, action: "price.provider_create", entity: "PlanPrice", entityId: id, before: { providerPriceId: null }, after: { providerPriceId: priceId } });
  return after;
}

/** Matrix data for /admin/plans. */
export async function getPlansMatrix() {
  const [plans, markets] = await Promise.all([
    db.plan.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { ...PLAN_SELECT, prices: { select: PRICE_SELECT } },
    }),
    db.market.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], select: { id: true, code: true, name: true, currency: true, locale: true, minPriceMinor: true, isActive: true, paymentProvider: true } }),
  ]);
  return { plans, markets, intervals: INTERVAL_ORDER };
}

/** Prices for coupon targeting (id + label). */
export async function listPriceOptions() {
  const rows = await db.planPrice.findMany({
    where: { plan: { deletedAt: null } },
    orderBy: [{ market: { code: "asc" } }, { plan: { sortOrder: "asc" } }],
    select: { id: true, interval: true, amountMinor: true, currency: true, isActive: true, plan: { select: { name: true } }, market: { select: { code: true, locale: true } } },
  });
  return rows;
}
