import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getPricing } from "@/server/services/catalog";
import { getCheckoutQuote } from "@/server/services/billing/checkout";
import { clearPlanMarketCopy, savePlanMarketCopy } from "@/server/services/billing/catalog-admin";
import { logosFor, PLACED_LOGOS_BY_MARKET } from "@/components/marketing/placed-logos";
import { makeMarket, makeStudent, resetDb, uid } from "../setup/db";

/** Per-market plan text (D-157) and per-country logo strip (D-158). */
beforeEach(resetDb);

async function twoMarkets() {
  const us = await makeMarket("US");
  const style = await db.resumeStyle.findFirstOrThrow({ select: { id: true } });
  const uk = await db.market.create({ data: { code: "UK", name: "United Kingdom", currency: "GBP", minPriceMinor: 3900, defaultTimezone: "Europe/London", resumeStyleId: style.id } });
  const plan = await db.plan.create({ data: { code: uid("std"), name: "Standard", description: "Shared description", features: ["Shared A", "Shared B"] } });
  for (const m of [us, uk]) await db.planPrice.create({ data: { planId: plan.id, marketId: m.id, interval: "MONTHLY", amountMinor: 29900, currency: m.currency, dailyTarget: 35 } });
  return { us, uk, plan };
}

describe("savePlanMarketCopy", () => {
  it("overrides only its own market, empty fields fall through, and clearing restores the shared text", async () => {
    const { us, uk, plan } = await twoMarkets();
    await savePlanMarketCopy("admin", plan.id, "UK", { name: "Standard UK", features: ["UK only feature"] });
    const ukP = (await getPricing("UK")).plans.find((p) => p.planId === plan.id)!;
    const usP = (await getPricing("US")).plans.find((p) => p.planId === plan.id)!;
    expect(ukP).toMatchObject({ name: "Standard UK", description: "Shared description", features: ["UK only feature"] });
    expect(usP).toMatchObject({ name: "Standard", description: "Shared description", features: ["Shared A", "Shared B"] });
    // Checkout shows the same per-market text.
    const student = await makeStudent(uk.id);
    const price = await db.planPrice.findFirstOrThrow({ where: { planId: plan.id, marketId: uk.id } });
    const q = await getCheckoutQuote({ userId: student.user.id, studentId: student.student.id }, price.id);
    expect(q.planName).toBe("Standard UK");
    expect(q.features).toEqual(["UK only feature"]);
    expect(await db.auditLog.count({ where: { action: "plan.market_copy", entityId: plan.id } })).toBe(1);
    // Clear → shared text again.
    expect(await clearPlanMarketCopy("admin", plan.id, "UK")).toEqual({ cleared: true });
    expect((await getPricing("UK")).plans.find((p) => p.planId === plan.id)!.name).toBe("Standard");
    expect(await clearPlanMarketCopy("admin", plan.id, "UK")).toEqual({ cleared: false });
    void us;
  });

  it("validates: more than 12 features, an all-empty override and an unknown market are rejected", async () => {
    const { plan } = await twoMarkets();
    await expect(savePlanMarketCopy("admin", plan.id, "UK", { features: Array.from({ length: 13 }, (_, i) => `F${i}`) })).rejects.toThrow();
    await expect(savePlanMarketCopy("admin", plan.id, "UK", { name: "", description: "", features: [] })).rejects.toThrow(/shared text/);
    await expect(savePlanMarketCopy("admin", plan.id, "FR", { name: "x" })).rejects.toThrow(/Market not found/);
  });
});

describe("logosFor (D-158)", () => {
  it("picks the market list, falls back to US, and honours an admin override with text badges for unknown names", () => {
    expect(PLACED_LOGOS_BY_MARKET.IN.map((l) => l.name)).toContain("TCS");
    expect(PLACED_LOGOS_BY_MARKET.UK.map((l) => l.name)).toContain("Barclays");
    expect(PLACED_LOGOS_BY_MARKET.US.map((l) => l.name)).not.toContain("Paytm");
    expect(logosFor("CA")).toBe(PLACED_LOGOS_BY_MARKET.US);
    expect(logosFor("IN", [])).toBe(PLACED_LOGOS_BY_MARKET.IN);
    const custom = logosFor("IN", ["infosys", "Deloitte"]);
    expect(custom).toEqual([expect.objectContaining({ kind: "image", name: "Infosys" }), { kind: "text", name: "Deloitte" }]);
  });
});

describe("per-market Most popular (D-161)", () => {
  it("makes one plan the badge in one market only; other markets keep the shared flag", async () => {
    const { us, uk, plan: standard } = await twoMarkets();
    await db.plan.update({ where: { id: standard.id }, data: { isFeatured: true } });
    const premium = await db.plan.create({ data: { code: uid("prem"), name: "Premium", features: ["P"] } });
    for (const m of [us, uk]) await db.planPrice.create({ data: { planId: premium.id, marketId: m.id, interval: "MONTHLY", amountMinor: 39900, currency: m.currency, dailyTarget: 45 } });

    await savePlanMarketCopy("admin", premium.id, "UK", { featured: "yes" });
    const ukPlans = (await getPricing("UK")).plans;
    const usPlans = (await getPricing("US")).plans;
    expect(ukPlans.filter((p) => p.isFeatured).map((p) => p.name)).toEqual(["Premium"]);
    expect(usPlans.filter((p) => p.isFeatured).map((p) => p.name)).toEqual(["Standard"]);
    // Premium's UK text is still the shared text (only the badge changed).
    expect(ukPlans.find((p) => p.planId === premium.id)!.features).toEqual(["P"]);

    // Back to the shared setting for both → Standard is the badge again in the UK.
    await clearPlanMarketCopy("admin", premium.id, "UK");
    await clearPlanMarketCopy("admin", standard.id, "UK");
    expect((await getPricing("UK")).plans.filter((p) => p.isFeatured).map((p) => p.name)).toEqual(["Standard"]);
  });

  it("refuses an empty save but accepts a badge-only one", async () => {
    const { plan } = await twoMarkets();
    await expect(savePlanMarketCopy("admin", plan.id, "UK", {})).rejects.toThrow(/Most popular/);
    await expect(savePlanMarketCopy("admin", plan.id, "UK", { featured: "no" })).resolves.toMatchObject({ isFeatured: false });
  });
});

