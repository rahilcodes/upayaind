import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { belowTargetStudents, churnRate, churnThisMonth, getMrr, mrrByCurrency, proratedExpected, ragFor, todayTargets } from "@/server/services/admin-metrics";
import { dayKey, startOfDayInTz } from "@/lib/dates";
import { makeEmployee, makeMarket, makeStudent, resetDb, uid } from "../setup/db";

beforeEach(async () => {
  await resetDb();
});

async function makePrice(marketId: string, currency: string, interval: "MONTHLY" | "QUARTERLY" | "YEARLY" | "HALF_YEARLY" | "ONE_TIME", amountMinor: number, dailyTarget = 10) {
  const plan = await db.plan.create({ data: { code: uid("p"), name: "Plan" } });
  return db.planPrice.create({ data: { planId: plan.id, marketId, interval, amountMinor, currency, dailyTarget } });
}

async function subscribe(studentId: string, planPriceId: string, status: "ACTIVE" | "CANCELED" | "EXPIRED" = "ACTIVE") {
  return db.subscription.create({ data: { studentId, planPriceId, status, provider: "MANUAL", currentPeriodEnd: new Date(Date.now() + 20 * 86400e3) } });
}

describe("mrrByCurrency (pure)", () => {
  it("normalises each interval to one month and never mixes currencies", () => {
    const rows = mrrByCurrency([
      { amountMinor: 10000, currency: "USD", interval: "MONTHLY" },
      { amountMinor: 30000, currency: "USD", interval: "QUARTERLY" },
      { amountMinor: 120000, currency: "USD", interval: "YEARLY" },
      { amountMinor: 60000, currency: "usd", interval: "HALF_YEARLY" },
      { amountMinor: 900000, currency: "INR", interval: "QUARTERLY" },
    ]);
    expect(rows).toEqual([
      { currency: "USD", amountMinor: 40000, subscriptions: 4 },
      { currency: "INR", amountMinor: 300000, subscriptions: 1 },
    ]);
  });
  it("treats ONE_TIME as a one-month plan", () => {
    expect(mrrByCurrency([{ amountMinor: 5000, currency: "GBP", interval: "ONE_TIME" }])).toEqual([{ currency: "GBP", amountMinor: 5000, subscriptions: 1 }]);
  });
});

describe("targets (pure)", () => {
  it("pro-rates the target over the working day", () => {
    expect(proratedExpected(20, 9 * 60, 9 * 60, 8)).toBe(0);
    expect(proratedExpected(20, 13 * 60, 9 * 60, 8)).toBe(10);
    expect(proratedExpected(20, 23 * 60, 9 * 60, 8)).toBe(20);
    expect(proratedExpected(0, 13 * 60, 9 * 60, 8)).toBe(0);
  });
  it("applies F10 colours", () => {
    expect(ragFor(10, 20, 10)).toBe("green");
    expect(ragFor(6, 20, 10)).toBe("amber");
    expect(ragFor(5, 20, 10)).toBe("red");
    expect(ragFor(20, 20, 20)).toBe("done");
    expect(ragFor(0, 0, 0)).toBe("off");
    expect(ragFor(0, 20, 0)).toBe("green");
  });
  it("computes churn rate", () => {
    expect(churnRate(1, 9)).toBe(0.1);
    expect(churnRate(0, 0)).toBe(0);
  });
});

describe("MRR from the database", () => {
  it("only counts ACTIVE subscriptions and keeps currencies apart", async () => {
    const us = await makeMarket("US");
    const uk = await db.market.create({ data: { code: "UK", name: "UK", currency: "GBP", minPriceMinor: 100, defaultTimezone: "Europe/London", resumeStyleId: us.resumeStyleId } });
    const usd = await makePrice(us.id, "USD", "QUARTERLY", 29700);
    const gbp = await makePrice(uk.id, "GBP", "MONTHLY", 9900);
    const a = await makeStudent(us.id);
    const b = await makeStudent(uk.id);
    const c = await makeStudent(us.id);
    await subscribe(a.student.id, usd.id);
    await subscribe(b.student.id, gbp.id);
    await subscribe(c.student.id, usd.id, "CANCELED");
    const mrr = await getMrr();
    expect(mrr).toHaveLength(2);
    expect(mrr.find((m) => m.currency === "USD")).toEqual({ currency: "USD", amountMinor: 9900, subscriptions: 1 });
    expect(mrr.find((m) => m.currency === "GBP")).toEqual({ currency: "GBP", amountMinor: 9900, subscriptions: 1 });
  });
});

describe("churn this month", () => {
  it("counts students whose subscription ended this month and who have no active plan", async () => {
    const m = await makeMarket();
    const price = await makePrice(m.id, "USD", "MONTHLY", 9900);
    const kept = await makeStudent(m.id);
    const gone = await makeStudent(m.id);
    const renewed = await makeStudent(m.id);
    await subscribe(kept.student.id, price.id);
    await subscribe(gone.student.id, price.id, "EXPIRED");
    await subscribe(renewed.student.id, price.id, "CANCELED");
    await subscribe(renewed.student.id, price.id, "ACTIVE");
    const old = await makeStudent(m.id);
    const s = await subscribe(old.student.id, price.id, "CANCELED");
    await db.$executeRaw`UPDATE "Subscription" SET "updatedAt" = now() - interval '70 days' WHERE id = ${s.id}`;
    const c = await churnThisMonth(new Date(), "UTC");
    expect(c.churned).toBe(1);
    expect(c.activeNow).toBe(2);
    expect(c.rate).toBeCloseTo(1 / 3);
  });
});

describe("below-target list", () => {
  it("flags students behind their pro-rated target and ignores non-working days and inactive students", async () => {
    const m = await makeMarket();
    await db.market.update({ where: { id: m.id }, data: { workingDays: [1, 2, 3, 4, 5, 6, 7] } });
    const price = await makePrice(m.id, "USD", "MONTHLY", 9900, 20);
    const emp = await makeEmployee(m.id);
    await db.employeeProfile.update({ where: { id: emp.employee.id }, data: { workSchedule: { days: [1, 2, 3, 4, 5], startTime: "00:00", hours: 1 } } });
    const behind = await makeStudent(m.id, "Behind");
    const onTrack = await makeStudent(m.id, "OnTrack");
    const inactive = await makeStudent(m.id, "Inactive");
    for (const s of [behind, onTrack]) {
      await subscribe(s.student.id, price.id);
      await db.assignment.create({ data: { studentId: s.student.id, employeeId: emp.employee.id, source: "AUTO" } });
    }
    await subscribe(inactive.student.id, price.id, "EXPIRED");
    // "Now" is 12:00 in the employee's tz → the whole 1-hour day has elapsed → expected = full target.
    const now = new Date(startOfDayInTz(dayKey(new Date(), "Asia/Kolkata"), "Asia/Kolkata").getTime() + 12 * 3600e3);
    const apps = Array.from({ length: 20 }, (_, i) => ({
      studentId: onTrack.student.id,
      employeeId: emp.employee.id,
      companyName: `Co${i}`,
      jobTitle: "Analyst",
      jobUrl: `https://x.test/${i}`,
      jobUrlNormalized: `x.test/${i}`,
      source: "LINKEDIN" as const,
      appliedAt: now,
    }));
    await db.jobApplication.createMany({ data: [...apps, { ...apps[0]!, studentId: behind.student.id, jobUrlNormalized: "x.test/b" }] });
    const rows = await todayTargets(now);
    expect(rows.map((r) => r.name).sort()).toEqual(["Behind", "OnTrack"]);
    const b = rows.find((r) => r.name === "Behind")!;
    expect(b.applied).toBe(1);
    expect(b.target).toBe(20);
    const below = await belowTargetStudents(now);
    expect(b.expected).toBe(20);
    expect(b.rag).toBe("red");
    expect(below.map((r) => r.name)).toEqual(["Behind"]);
    expect(rows.find((r) => r.name === "OnTrack")!.rag).toBe("done");
  });
});
