import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { cancelAtPeriodEnd, changePlan, grantPlan, listGrantablePrices, recordManualPayment, setSubscriptionPeriod, setSubscriptionStatus, type Actor } from "@/server/services/billing/manual";
import { runSubscriptionStatusSweep } from "@/server/services/billing/renewals";
import { makeEmployee, makeMarket, makeStudent, resetDb, uid } from "../setup/db";

/** Student 360 → manual plans & payments (D-147b). */

beforeEach(async () => {
  await resetDb();
});

const DAY = 86_400_000;

async function makePlanPrice(marketId: string, opts: { amountMinor?: number; interval?: "MONTHLY" | "QUARTERLY" | "ONE_TIME"; isActive?: boolean; currency?: string; dailyTarget?: number; name?: string } = {}) {
  const plan = await db.plan.create({ data: { code: uid("plan"), name: opts.name ?? "Standard", features: ["A"] } });
  return db.planPrice.create({
    data: { planId: plan.id, marketId, interval: opts.interval ?? "MONTHLY", amountMinor: opts.amountMinor ?? 29900, currency: opts.currency ?? "USD", dailyTarget: opts.dailyTarget ?? 35, isActive: opts.isActive ?? true },
  });
}

async function makeAdmin(): Promise<Actor> {
  const u = await db.user.create({ data: { email: `${uid("a")}@t.test`, name: "Admin", role: "ADMIN" } });
  return { id: u.id, role: "ADMIN" };
}

async function setup() {
  const m = await makeMarket();
  const pp = await makePlanPrice(m.id);
  const s = await makeStudent(m.id);
  const admin = await makeAdmin();
  return { m, pp, s, admin };
}

describe("grantPlan", () => {
  it("ACTIVE grant creates a MANUAL subscription with a computed period, closes a pending row and auto-assigns", async () => {
    const { m, pp, s, admin } = await setup();
    const emp = await makeEmployee(m.id);
    const pending = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: pp.id, status: "PENDING_PAYMENT", provider: "STRIPE" } });
    const start = new Date("2026-03-10T12:00:00Z");
    const r = await grantPlan(admin, { studentId: s.student.id, planPriceId: pp.id, startsAt: start, note: "Paid by bank transfer" });
    const sub = await db.subscription.findUniqueOrThrow({ where: { id: r.subscriptionId } });
    expect(sub).toMatchObject({ provider: "MANUAL", status: "ACTIVE", cancelAtPeriodEnd: false, remindersSent: [] });
    expect(sub.currentPeriodStart!.toISOString()).toBe(start.toISOString());
    expect(sub.currentPeriodEnd!.toISOString()).toBe("2026-04-10T12:00:00.000Z");
    expect((await db.subscription.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CANCELED");
    const assignment = await db.assignment.findFirst({ where: { studentId: s.student.id, isActive: true } });
    expect(assignment?.employeeId).toBe(emp.employee.id);
    expect(await db.auditLog.count({ where: { action: "subscription.grant", entityId: sub.id, actorId: admin.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "subscription.activate", entityId: sub.id, actorId: admin.id } })).toBe(1);
  });

  it("computes QUARTERLY periods and honours an explicit period end", async () => {
    const { m, s, admin } = await setup();
    const q = await makePlanPrice(m.id, { interval: "QUARTERLY" });
    const start = new Date("2026-01-31T12:00:00Z");
    const a = await grantPlan(admin, { studentId: s.student.id, planPriceId: q.id, startsAt: start });
    expect(a.currentPeriodEnd.toISOString()).toBe("2026-05-01T12:00:00.000Z"); // Jan 31 + 3 months rolls over
    const explicit = new Date("2026-02-15T12:00:00Z");
    const b = await grantPlan(admin, { studentId: s.student.id, planPriceId: q.id, startsAt: start, periodEnd: explicit });
    expect(b.currentPeriodEnd.toISOString()).toBe(explicit.toISOString());
    await expect(grantPlan(admin, { studentId: s.student.id, planPriceId: q.id, startsAt: start, periodEnd: new Date("2026-01-01T00:00:00Z") })).rejects.toThrow(/after the start/);
  });

  it("PENDING_PAYMENT grant does not activate or assign", async () => {
    const { m, pp, s, admin } = await setup();
    await makeEmployee(m.id);
    const r = await grantPlan(admin, { studentId: s.student.id, planPriceId: pp.id, status: "PENDING_PAYMENT" });
    expect((await db.subscription.findUniqueOrThrow({ where: { id: r.subscriptionId } })).status).toBe("PENDING_PAYMENT");
    expect(await db.assignment.count({ where: { studentId: s.student.id } })).toBe(0);
  });

  it("refuses a price from another market, an inactive price, and a live STRIPE subscription", async () => {
    const { pp, s, admin } = await setup();
    const other = await makeMarket("GB");
    const foreign = await makePlanPrice(other.id, { currency: "GBP" });
    await expect(grantPlan(admin, { studentId: s.student.id, planPriceId: foreign.id })).rejects.toThrow(/another market/);
    const m = await db.market.findUniqueOrThrow({ where: { code: "US" } });
    const inactive = await makePlanPrice(m.id, { isActive: false });
    await expect(grantPlan(admin, { studentId: s.student.id, planPriceId: inactive.id })).rejects.toThrow(/isn’t active/);
    await db.subscription.create({ data: { studentId: s.student.id, planPriceId: pp.id, status: "ACTIVE", provider: "STRIPE", providerSubId: "sub_live", currentPeriodEnd: new Date(Date.now() + 10 * DAY) } });
    await expect(grantPlan(admin, { studentId: s.student.id, planPriceId: pp.id })).rejects.toThrow(/STRIPE subscription.*gateway/);
  });

  it("listGrantablePrices returns active prices of the market only and flags placeholders", async () => {
    const { m, pp } = await setup();
    const zero = await makePlanPrice(m.id, { amountMinor: 0, name: "Placeholder" });
    await makePlanPrice(m.id, { isActive: false });
    const other = await makeMarket("GB");
    await makePlanPrice(other.id, { currency: "GBP" });
    const list = await listGrantablePrices(m.id);
    expect(list.map((p) => p.id).sort()).toEqual([pp.id, zero.id].sort());
    expect(list.find((p) => p.id === zero.id)?.placeholder).toBe(true);
    expect(list.find((p) => p.id === pp.id)?.placeholder).toBe(false);
  });
});

describe("changePlan / setSubscriptionPeriod / setSubscriptionStatus / cancelAtPeriodEnd", () => {
  it("changePlan updates the price, audits before/after and notifies the student", async () => {
    const { m, pp, s, admin } = await setup();
    const premium = await makePlanPrice(m.id, { amountMinor: 49900, dailyTarget: 60, name: "Premium" });
    const g = await grantPlan(admin, { studentId: s.student.id, planPriceId: pp.id });
    await changePlan(admin, { subscriptionId: g.subscriptionId, planPriceId: premium.id, note: "Upgrade" });
    expect((await db.subscription.findUniqueOrThrow({ where: { id: g.subscriptionId } })).planPriceId).toBe(premium.id);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "subscription.change_plan", entityId: g.subscriptionId } });
    expect(log.before).toMatchObject({ planPriceId: pp.id });
    expect(log.after).toMatchObject({ planPriceId: premium.id, note: "Upgrade" });
    const n = await db.notification.findFirstOrThrow({ where: { userId: s.user.id, type: "plan_changed" } });
    expect(n.body).toContain("Premium");
    expect(n.body).toContain("60 applications per weekday");
    await expect(changePlan(admin, { subscriptionId: g.subscriptionId, planPriceId: premium.id })).rejects.toThrow(/already on this plan/);
  });

  it("gateway subscriptions are refused by every mutating function", async () => {
    const { m, pp, s, admin } = await setup();
    const stripe = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: pp.id, status: "ACTIVE", provider: "STRIPE", providerSubId: "sub_x", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 10 * DAY) } });
    const other = await makePlanPrice(m.id);
    await expect(changePlan(admin, { subscriptionId: stripe.id, planPriceId: other.id })).rejects.toThrow(/managed by STRIPE/);
    await expect(setSubscriptionPeriod(admin, { subscriptionId: stripe.id, currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + DAY) })).rejects.toThrow(/managed by STRIPE/);
    await expect(setSubscriptionStatus(admin, { subscriptionId: stripe.id, status: "CANCELED" })).rejects.toThrow(/managed by STRIPE/);
    await expect(cancelAtPeriodEnd(admin, { subscriptionId: stripe.id, cancel: true })).rejects.toThrow(/gateway/);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: stripe.id } })).status).toBe("ACTIVE");
  });

  it("setSubscriptionPeriod resets reminders and rejects end <= start", async () => {
    const { pp, s, admin } = await setup();
    const g = await grantPlan(admin, { studentId: s.student.id, planPriceId: pp.id });
    await db.subscription.update({ where: { id: g.subscriptionId }, data: { remindersSent: ["T7:x"] } });
    const start = new Date("2026-05-01T12:00:00Z");
    const end = new Date("2026-08-01T12:00:00Z");
    await setSubscriptionPeriod(admin, { subscriptionId: g.subscriptionId, currentPeriodStart: start, currentPeriodEnd: end });
    const sub = await db.subscription.findUniqueOrThrow({ where: { id: g.subscriptionId } });
    expect(sub.currentPeriodStart!.toISOString()).toBe(start.toISOString());
    expect(sub.currentPeriodEnd!.toISOString()).toBe(end.toISOString());
    expect(sub.remindersSent).toEqual([]);
    await expect(setSubscriptionPeriod(admin, { subscriptionId: g.subscriptionId, currentPeriodStart: end, currentPeriodEnd: start })).rejects.toThrow(/after the start/);
    await expect(setSubscriptionPeriod(admin, { subscriptionId: g.subscriptionId, currentPeriodStart: end, currentPeriodEnd: end })).rejects.toThrow(/after the start/);
    expect(await db.auditLog.count({ where: { action: "subscription.set_period", entityId: g.subscriptionId } })).toBe(1);
  });

  it("status CANCELED clears cancelAtPeriodEnd and notifies; ACTIVE re-activates and closes other live rows", async () => {
    const { m, pp, s, admin } = await setup();
    await makeEmployee(m.id);
    const g = await grantPlan(admin, { studentId: s.student.id, planPriceId: pp.id });
    await cancelAtPeriodEnd(admin, { subscriptionId: g.subscriptionId, cancel: true });
    await setSubscriptionStatus(admin, { subscriptionId: g.subscriptionId, status: "CANCELED", note: "Refund requested" });
    const canceled = await db.subscription.findUniqueOrThrow({ where: { id: g.subscriptionId } });
    expect(canceled).toMatchObject({ status: "CANCELED", cancelAtPeriodEnd: false });
    expect(await db.notification.count({ where: { userId: s.user.id, type: "subscription_canceled" } })).toBe(1);
    await expect(setSubscriptionStatus(admin, { subscriptionId: g.subscriptionId, status: "CANCELED" })).rejects.toThrow(/already canceled/);

    // Another pending row appears; re-activating the canceled manual plan closes it and re-emits activation.
    const pending = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: pp.id, status: "PENDING_PAYMENT", provider: "MANUAL" } });
    await setSubscriptionStatus(admin, { subscriptionId: g.subscriptionId, status: "ACTIVE" });
    expect((await db.subscription.findUniqueOrThrow({ where: { id: g.subscriptionId } })).status).toBe("ACTIVE");
    expect((await db.subscription.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CANCELED");
    expect(await db.assignment.count({ where: { studentId: s.student.id, isActive: true } })).toBe(1);
  });

  it("ACTIVE is refused without a future period end", async () => {
    const { pp, s, admin } = await setup();
    const g = await grantPlan(admin, { studentId: s.student.id, planPriceId: pp.id, status: "PENDING_PAYMENT", startsAt: new Date(Date.now() - 60 * DAY) });
    await expect(setSubscriptionStatus(admin, { subscriptionId: g.subscriptionId, status: "ACTIVE" })).rejects.toThrow(/already ended/);
    await db.subscription.update({ where: { id: g.subscriptionId }, data: { currentPeriodEnd: null } });
    await expect(setSubscriptionStatus(admin, { subscriptionId: g.subscriptionId, status: "ACTIVE" })).rejects.toThrow(/Set the period/);
  });

  it("cancelAtPeriodEnd toggles the flag and the sweep expires the plan at period end", async () => {
    const { pp, s, admin } = await setup();
    const g = await grantPlan(admin, { studentId: s.student.id, planPriceId: pp.id });
    expect((await cancelAtPeriodEnd(admin, { subscriptionId: g.subscriptionId, cancel: true })).cancelAtPeriodEnd).toBe(true);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: g.subscriptionId } })).cancelAtPeriodEnd).toBe(true);
    expect((await cancelAtPeriodEnd(admin, { subscriptionId: g.subscriptionId, cancel: false })).cancelAtPeriodEnd).toBe(false);
    await cancelAtPeriodEnd(admin, { subscriptionId: g.subscriptionId, cancel: true });
    // Before the period end nothing changes; after it the manual plan expires.
    expect((await runSubscriptionStatusSweep(new Date())).changed).toBe(0);
    const r = await runSubscriptionStatusSweep(new Date(g.currentPeriodEnd.getTime() + 1000));
    expect(r.changed).toBe(1);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: g.subscriptionId } })).status).toBe("EXPIRED");
  });
});

describe("recordManualPayment", () => {
  it("creates a SUCCEEDED MANUAL payment with an invoice number + PDF and activates a PENDING subscription", async () => {
    const { m, pp, s, admin } = await setup();
    const emp = await makeEmployee(m.id);
    const g = await grantPlan(admin, { studentId: s.student.id, planPriceId: pp.id, status: "PENDING_PAYMENT" });
    const paidAt = new Date("2026-04-02T12:00:00Z");
    const r = await recordManualPayment(admin, { studentId: s.student.id, subscriptionId: g.subscriptionId, amountMinor: 29900, currency: "usd", paidAt, method: "bank", reference: "UTR123", note: "Received" });
    const p = await db.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    expect(p).toMatchObject({ status: "SUCCEEDED", provider: "MANUAL", amountMinor: 29900, currency: "USD", subscriptionId: g.subscriptionId });
    expect(p.providerPaymentId).toMatch(/^manual_/);
    expect(p.invoiceNumber).toMatch(/^UPY-2026-\d{6}$/);
    expect(p.invoiceKey).toBeTruthy();
    expect(p.paidAt!.toISOString()).toBe(paidAt.toISOString());
    const sub = await db.subscription.findUniqueOrThrow({ where: { id: g.subscriptionId } });
    expect(sub.status).toBe("ACTIVE");
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(sub.currentPeriodStart!.getTime());
    expect((await db.assignment.findFirst({ where: { studentId: s.student.id, isActive: true } }))?.employeeId).toBe(emp.employee.id);
    expect(await db.notification.count({ where: { userId: s.user.id, type: "payment_succeeded" } })).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "payment.manual", entityId: p.id } });
    expect(log.after).toMatchObject({ method: "bank", reference: "UTR123", note: "Received", amountMinor: 29900 });
  });

  it("works without a subscription and refuses a currency mismatch, a future date and a non-positive amount", async () => {
    const { s, admin } = await setup();
    const r = await recordManualPayment(admin, { studentId: s.student.id, amountMinor: 5000, currency: "USD", paidAt: new Date(), method: "cash" });
    expect((await db.payment.findUniqueOrThrow({ where: { id: r.paymentId } })).subscriptionId).toBeNull();
    await expect(recordManualPayment(admin, { studentId: s.student.id, amountMinor: 5000, currency: "INR", paidAt: new Date(), method: "upi" })).rejects.toThrow(/recorded in USD/);
    await expect(recordManualPayment(admin, { studentId: s.student.id, amountMinor: 5000, currency: "USD", paidAt: new Date(Date.now() + 3 * DAY), method: "cash" })).rejects.toThrow(/future/);
    await expect(recordManualPayment(admin, { studentId: s.student.id, amountMinor: 0, currency: "USD", paidAt: new Date(), method: "cash" })).rejects.toThrow(/above zero/);
    expect(await db.payment.count({ where: { studentId: s.student.id } })).toBe(1);
  });

  it("a subscription of another student can't be linked", async () => {
    const { m, pp, s, admin } = await setup();
    const other = await makeStudent(m.id);
    const g = await grantPlan(admin, { studentId: other.student.id, planPriceId: pp.id });
    await expect(recordManualPayment(admin, { studentId: s.student.id, subscriptionId: g.subscriptionId, amountMinor: 100, currency: "USD", paidAt: new Date(), method: "cash" })).rejects.toThrow(/another student/);
  });
});

describe("billing.manage guard", () => {
  it("EMPLOYEE and MANAGER are refused by every function", async () => {
    const { pp, s } = await setup();
    for (const role of ["EMPLOYEE", "MANAGER", "COACH", "STUDENT"] as const) {
      const u = await db.user.create({ data: { email: `${uid("u")}@t.test`, name: role, role } });
      const actor: Actor = { id: u.id, role };
      await expect(grantPlan(actor, { studentId: s.student.id, planPriceId: pp.id })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(changePlan(actor, { subscriptionId: "x", planPriceId: pp.id })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setSubscriptionPeriod(actor, { subscriptionId: "x", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + DAY) })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setSubscriptionStatus(actor, { subscriptionId: "x", status: "CANCELED" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(cancelAtPeriodEnd(actor, { subscriptionId: "x", cancel: true })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(recordManualPayment(actor, { studentId: s.student.id, amountMinor: 100, currency: "USD", paidAt: new Date(), method: "cash" })).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await db.subscription.count()).toBe(0);
    expect(await db.payment.count()).toBe(0);
  });
});
