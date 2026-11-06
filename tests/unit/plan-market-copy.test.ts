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
