import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";
import { providerFor } from "./provider";
import { stripeProvider } from "./stripe";
import { BillingError } from "./types";

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "Coupon codes are at least 3 characters")
  .max(40, "Coupon codes are at most 40 characters")
  .regex(/^[A-Z0-9_-]+$/, "Use letters, numbers, dashes and underscores only");

export type CouponCheck = {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: string | null;
  providerCouponId: string | null;
  discountMinor: number;
  finalMinor: number;
};

type CouponRow = {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffMinor: number | null;
  currency: string | null;
  maxRedemptions: number | null;
  redeemed: number;
  validFrom: Date | null;
  validTo: Date | null;
  planPriceIds: string[];
  providerCouponId: string | null;
  isActive: boolean;
};

const COUPON_SELECT = {
  id: true,
  code: true,
  percentOff: true,
  amountOffMinor: true,
  currency: true,
  maxRedemptions: true,
  redeemed: true,
  validFrom: true,
  validTo: true,
  planPriceIds: true,
  providerCouponId: true,
  isActive: true,
} as const;

/** Pure rule check (unit-tested): is this coupon usable for this price right now? */
export function checkCoupon(c: CouponRow, price: { id: string; amountMinor: number; currency: string }, now = new Date()): CouponCheck {
  const fail = (m: string) => {
    throw new BillingError(m, "coupon");
  };
  if (!c.isActive) fail("This coupon is no longer active.");
  if (c.validFrom && c.validFrom > now) fail("This coupon isn’t valid yet.");
  if (c.validTo && c.validTo < now) fail("This coupon has expired.");
  if (c.maxRedemptions !== null && c.redeemed >= c.maxRedemptions) fail("This coupon has reached its redemption limit.");
  if (c.planPriceIds.length > 0 && !c.planPriceIds.includes(price.id)) fail("This coupon doesn’t apply to the selected plan.");
  let discount = 0;
  if (c.percentOff) discount = Math.round((price.amountMinor * c.percentOff) / 100);
  else if (c.amountOffMinor) {
    if (!c.currency || c.currency.toUpperCase() !== price.currency.toUpperCase()) fail("This coupon can’t be used with this currency.");
    discount = c.amountOffMinor;
  } else fail("This coupon has no discount configured.");
  discount = Math.min(discount, price.amountMinor);
  return {
    id: c.id,
    code: c.code,
    percentOff: c.percentOff,
    amountOffMinor: c.amountOffMinor,
    currency: c.currency,
    providerCouponId: c.providerCouponId,
    discountMinor: discount,
    finalMinor: price.amountMinor - discount,
  };
}

export async function validateCoupon(code: string, price: { id: string; amountMinor: number; currency: string }, now = new Date()) {
  const parsed = couponCodeSchema.safeParse(code);
  if (!parsed.success) throw new BillingError("That coupon code isn’t valid.", "coupon");
  const c = await db.coupon.findUnique({ where: { code: parsed.data }, select: COUPON_SELECT });
  if (!c) throw new BillingError("That coupon code isn’t valid.", "coupon");
  return checkCoupon(c, price, now);
}

/** Count a redemption after a successful payment (never exceeds maxRedemptions). */
export async function redeemCoupon(couponId: string) {
  await db.$executeRaw`UPDATE "Coupon" SET "redeemed" = "redeemed" + 1 WHERE "id" = ${couponId} AND ("maxRedemptions" IS NULL OR "redeemed" < "maxRedemptions")`;
}

// ───────────────────────────── Admin CRUD ─────────────────────────────

export const couponInputSchema = z
  .object({
    id: z.string().optional(),
    code: couponCodeSchema,
    kind: z.enum(["percent", "amount"]),
    percentOff: z.coerce.number().int().min(1, "Between 1 and 100").max(100, "Between 1 and 100").optional(),
    amountOffMinor: z.coerce.number().int().positive("Enter an amount above zero").optional(),
    currency: z.string().trim().toUpperCase().length(3).optional(),
    maxRedemptions: z.coerce.number().int().positive().nullable().optional(),
    validFrom: z.coerce.date().nullable().optional(),
    validTo: z.coerce.date().nullable().optional(),
    planPriceIds: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "percent" && !v.percentOff) ctx.addIssue({ code: "custom", path: ["percentOff"], message: "Enter a percentage between 1 and 100" });
    if (v.kind === "amount" && !v.amountOffMinor) ctx.addIssue({ code: "custom", path: ["amountOffMinor"], message: "Enter an amount above zero" });
    if (v.kind === "amount" && !v.currency) ctx.addIssue({ code: "custom", path: ["currency"], message: "Choose a currency" });
    if (v.validFrom && v.validTo && v.validTo <= v.validFrom) ctx.addIssue({ code: "custom", path: ["validTo"], message: "The end date must be after the start date" });
  });
export type CouponInput = z.input<typeof couponInputSchema>;

export async function listCoupons() {
  return db.coupon.findMany({ orderBy: [{ isActive: "desc" }, { code: "asc" }], select: COUPON_SELECT });
}

export async function saveCoupon(actorId: string, raw: CouponInput) {
  const v = couponInputSchema.parse(raw);
  const data = {
    code: v.code,
    percentOff: v.kind === "percent" ? v.percentOff! : null,
    amountOffMinor: v.kind === "amount" ? v.amountOffMinor! : null,
    currency: v.kind === "amount" ? v.currency! : null,
    maxRedemptions: v.maxRedemptions ?? null,
    validFrom: v.validFrom ?? null,
    validTo: v.validTo ?? null,
    planPriceIds: v.planPriceIds,
    isActive: v.isActive,
  };
  if (v.planPriceIds.length) {
    const n = await db.planPrice.count({ where: { id: { in: v.planPriceIds } } });
    if (n !== v.planPriceIds.length) throw new BillingError("One of the selected plans no longer exists.", "planPriceIds");
  }
  const clash = await db.coupon.findUnique({ where: { code: v.code }, select: { id: true } });
  if (clash && clash.id !== v.id) throw new BillingError("A coupon with this code already exists.", "code");

  if (v.id) {
    const before = await db.coupon.findUnique({ where: { id: v.id }, select: COUPON_SELECT });
    if (!before) throw new BillingError("Coupon not found.");
    // Discount terms are frozen once a coupon exists at the provider or was used.
    const termsChanged = before.percentOff !== data.percentOff || before.amountOffMinor !== data.amountOffMinor || before.currency !== data.currency || before.code !== data.code;
    if (termsChanged && (before.redeemed > 0 || before.providerCouponId)) {
      throw new BillingError("The code and discount can’t change after the coupon was used or created at the payment provider. Create a new coupon instead.");
    }
    const after = await db.coupon.update({ where: { id: v.id }, data, select: COUPON_SELECT });
    await audit({ actorId, action: "coupon.update", entity: "Coupon", entityId: v.id, before, after });
    return after;
  }
  const created = await db.coupon.create({ data, select: COUPON_SELECT });
  await audit({ actorId, action: "coupon.create", entity: "Coupon", entityId: created.id, after: created });
  if (stripeProvider.isConfigured()) {
    try {
      return await syncCouponToProvider(actorId, created.id);
    } catch (e) {
      console.error("[billing] coupon created locally; provider sync failed", e);
    }
  }
  return created;
}

export async function setCouponActive(actorId: string, id: string, isActive: boolean) {
  const c = await db.coupon.update({ where: { id }, data: { isActive }, select: { id: true, code: true, isActive: true } });
  await audit({ actorId, action: isActive ? "coupon.activate" : "coupon.deactivate", entity: "Coupon", entityId: id, after: c });
  return c;
}

/** Create the coupon at Stripe (admin button / on create when configured). */
export async function syncCouponToProvider(actorId: string | null, id: string) {
  const c = await db.coupon.findUnique({ where: { id }, select: COUPON_SELECT });
  if (!c) throw new BillingError("Coupon not found.");
  if (c.providerCouponId) return c;
  const provider = providerFor("STRIPE");
  if (!provider.isConfigured()) throw new BillingError("Stripe isn’t configured, so the coupon can’t be created there yet.");
  const { couponId } = await provider.createCoupon({
    code: c.code,
    percentOff: c.percentOff,
    amountOffMinor: c.amountOffMinor,
    currency: c.currency,
    maxRedemptions: c.maxRedemptions,
    validTo: c.validTo,
  });
  const after = await db.coupon.update({ where: { id }, data: { providerCouponId: couponId }, select: COUPON_SELECT });
  await audit({ actorId, action: "coupon.provider_create", entity: "Coupon", entityId: id, after: { providerCouponId: couponId } });
  return after;
}
