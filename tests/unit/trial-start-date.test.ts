import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { defaultServiceStart } from "@/lib/service-start";
import { processWebhookEvent } from "@/server/services/billing/webhooks";
import { buildCheckoutCompletedEvent, buildRenewalPaidEvent } from "@/server/services/billing/simulate";
import { completeSimulatedCheckout, getCheckoutQuote, startCheckout } from "@/server/services/billing/checkout";
import { runRenewalReminders } from "@/server/services/billing/renewals";
import { setServiceStartDate } from "@/server/services/billing/start-date";
import { makeEmployee, makeMarket, makeStudent, resetDb, uid } from "../setup/db";

/** D-171: start-date rule, US free trial, admin start-date change, and the emails that go with them. */

beforeEach(resetDb);

const NY = "America/New_York";
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

describe("default start date: payment + 2 days, on a working day", () => {
  const start = (paid: string) => defaultServiceStart(new Date(paid), NY).toISOString();
  it("Monday → Wednesday, Tuesday → Thursday, Wednesday → Friday", () => {
    expect(start("2026-11-23T15:00:00Z")).toBe("2026-11-25T17:00:00.000Z");
    expect(start("2026-11-24T15:00:00Z")).toBe("2026-11-26T17:00:00.000Z");
    expect(start("2026-11-25T15:00:00Z")).toBe("2026-11-27T17:00:00.000Z");
  });
  it("Thursday, Friday and Saturday → Monday; Sunday → Tuesday", () => {
    expect(start("2026-11-26T15:00:00Z")).toBe("2026-11-30T17:00:00.000Z");
    expect(start("2026-11-27T15:00:00Z")).toBe("2026-11-30T17:00:00.000Z");
    expect(start("2026-11-28T15:00:00Z")).toBe("2026-11-30T17:00:00.000Z");
    expect(start("2026-11-29T15:00:00Z")).toBe("2026-12-01T17:00:00.000Z");
  });
  it("uses the market's own working days", () => {
    // Sunday–Thursday week: a Thursday payment lands on Saturday → moved to Sunday.
    expect(defaultServiceStart(new Date("2026-11-26T15:00:00Z"), NY, [7, 1, 2, 3, 4]).toISOString()).toBe("2026-11-29T17:00:00.000Z");
  });
});

async function usSetup(trialDays = 7) {
  const m = await makeMarket("US");
  await db.market.update({ where: { id: m.id }, data: { trialDays } });
  const plan = await db.plan.create({ data: { code: uid("plan"), name: "Standard", features: ["A"] } });
  const pp = await db.planPrice.create({ data: { planId: plan.id, marketId: m.id, interval: "MONTHLY", amountMinor: 25900, currency: "USD", dailyTarget: 35 } });
  const s = await makeStudent(m.id);
  const admin = await db.user.create({ data: { email: `${uid("adm")}@t.test`, name: "Admin", role: "ADMIN", status: "ACTIVE" } });
  await makeEmployee(m.id);
  return { m, pp, s, admin };
}

const who = (s: Awaited<ReturnType<typeof usSetup>>["s"]) => ({ userId: s.user.id, studentId: s.student.id, email: s.user.email });

describe("US free trial", () => {
  it("a first-time student is quoted a 7-day trial that counts from the start date", async () => {
    const { pp, s } = await usSetup();
    const q = await getCheckoutQuote(who(s), pp.id);
    expect(q.trial?.days).toBe(7);
    expect(q.startsAt).not.toBeNull();
    expect(q.trial!.endsAt.getTime() - q.startsAt!.getTime()).toBe(7 * 86_400_000);
  });

  it("no trial when the market has none, or the gateway is Razorpay", async () => {
    const { m, pp, s } = await usSetup(0);
    expect((await getCheckoutQuote(who(s), pp.id)).trial).toBeNull();
    await db.market.update({ where: { id: m.id }, data: { trialDays: 7, paymentProvider: "RAZORPAY" } });
    expect((await getCheckoutQuote(who(s), pp.id)).trial).toBeNull();
  });

  it("trial sign-up activates the plan with no payment, emails the student and the admin, and assigns a specialist", async () => {
    const { pp, s, admin } = await usSetup();
    const r = await startCheckout(who(s), { planPriceId: pp.id });
    expect(r.kind).toBe("simulate");
    const subId = (r as { subscriptionId: string }).subscriptionId;
    await completeSimulatedCheckout(who(s), { subscriptionId: subId });

    const sub = await db.subscription.findUniqueOrThrow({ where: { id: subId } });
    expect(sub.status).toBe("ACTIVE");
    expect(sub.trialEndsAt).not.toBeNull();
    expect(sub.serviceStartAt).not.toBeNull();
    expect(sub.trialEndsAt!.getTime() - sub.serviceStartAt!.getTime()).toBe(7 * 86_400_000);
    expect(iso(sub.currentPeriodEnd)).toBe(iso(sub.trialEndsAt));
    // Nothing was charged: no payment, no invoice.
    expect(await db.payment.count({ where: { studentId: s.student.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: s.user.id, type: "trial_started" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: admin.id, type: "trial_started_admin" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: s.user.id, type: "payment_succeeded" } })).toBe(0);
    expect(await db.assignment.count({ where: { studentId: s.student.id, isActive: true } })).toBe(1);
    // No "renews in N days" nag during the trial.
    const soon = new Date(sub.trialEndsAt!.getTime() - 2 * 86_400_000);
    expect((await runRenewalReminders(soon)).sent).toBe(0);
  });

  it("the first real charge ends the trial, records the payment and emails student and admin", async () => {
    const { pp, s, admin } = await usSetup();
    const r = await startCheckout(who(s), { planPriceId: pp.id });
    const subId = (r as { subscriptionId: string }).subscriptionId;
    await completeSimulatedCheckout(who(s), { subscriptionId: subId });
    const trial = await db.subscription.findUniqueOrThrow({ where: { id: subId } });

    await processWebhookEvent("STRIPE", await buildRenewalPaidEvent(subId, { now: trial.trialEndsAt! }));
    const paid = await db.subscription.findUniqueOrThrow({ where: { id: subId } });
    expect(paid.trialEndsAt).toBeNull();
    expect(paid.status).toBe("ACTIVE");
    expect(paid.currentPeriodEnd!.getTime()).toBeGreaterThan(trial.trialEndsAt!.getTime());
    const payments = await db.payment.findMany({ where: { studentId: s.student.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: "SUCCEEDED", amountMinor: 25900 });
    expect(await db.notification.count({ where: { userId: s.user.id, type: "payment_succeeded" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: admin.id, type: "payment_received_admin" } })).toBe(1);
  });

  it("a student who already had a plan gets no second trial", async () => {
    const { pp, s } = await usSetup();
    const r = await startCheckout(who(s), { planPriceId: pp.id });
    const subId = (r as { subscriptionId: string }).subscriptionId;
    await completeSimulatedCheckout(who(s), { subscriptionId: subId });
    await db.subscription.update({ where: { id: subId }, data: { status: "CANCELED" } });
    expect((await getCheckoutQuote(who(s), pp.id)).trial).toBeNull();
  });

  it("the trial reminder goes only to real trials", async () => {
    const { pp, s } = await usSetup();
    const r = await startCheckout(who(s), { planPriceId: pp.id });
    const subId = (r as { subscriptionId: string }).subscriptionId;
    await completeSimulatedCheckout(who(s), { subscriptionId: subId });
    const sub = await db.subscription.findUniqueOrThrow({ where: { id: subId } });
    const evt = (id: string) => ({ id: `evt_${uid()}`, type: "customer.subscription.trial_will_end", created: 1, data: { object: { id, status: "trialing", trial_end: Math.floor(sub.trialEndsAt!.getTime() / 1000), cancel_at_period_end: false, metadata: {}, items: { data: [] } } } });
    expect((await processWebhookEvent("STRIPE", evt(sub.providerSubId!))).detail).toBe("trial ending reminder sent");
    expect(await db.notification.count({ where: { userId: s.user.id, type: "trial_ending" } })).toBe(1);
    await db.subscription.update({ where: { id: subId }, data: { trialEndsAt: null } });
    expect((await processWebhookEvent("STRIPE", evt(sub.providerSubId!))).detail).toBe("not a free trial");
  });
});

describe("paid plans start after the setup days", () => {
  it("a paid Stripe subscription is billed from the start date, not the payment date", async () => {
    const { pp, s, admin } = await usSetup(0);
    const sub = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: pp.id, status: "PENDING_PAYMENT", provider: "STRIPE" } });
    // Paid on Monday 23 Nov 2026 → starts Wednesday 25 Nov → paid until 25 Dec.
    await processWebhookEvent("STRIPE", await buildCheckoutCompletedEvent(sub.id, { now: new Date("2026-11-23T15:00:00Z") }));
    const row = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(iso(row.serviceStartAt)).toBe("2026-11-25T17:00:00.000Z");
    expect(iso(row.currentPeriodEnd)).toBe("2026-12-25T17:00:00.000Z");
    expect(row.trialEndsAt).toBeNull();
    expect(await db.payment.count({ where: { studentId: s.student.id, status: "SUCCEEDED" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: admin.id, type: "payment_received_admin" } })).toBe(1);
  });
});

describe("admin changes the start date", () => {
  async function activeTrial() {
    const ctx = await usSetup();
    const r = await startCheckout(who(ctx.s), { planPriceId: ctx.pp.id });
    const subId = (r as { subscriptionId: string }).subscriptionId;
    await completeSimulatedCheckout(who(ctx.s), { subscriptionId: subId });
    return { ...ctx, sub: await db.subscription.findUniqueOrThrow({ where: { id: subId } }) };
  }

  it("moves a trial's first charge with the start date, audits it and emails the student", async () => {
    const { sub, s, admin } = await activeTrial();
    const newStart = new Date(sub.serviceStartAt!.getTime() + 3 * 86_400_000);
    await setServiceStartDate({ id: admin.id, role: "ADMIN" }, { subscriptionId: sub.id, startsAt: newStart, note: "Resume not ready" });
    const row = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(iso(row.serviceStartAt)).toBe(iso(newStart));
    expect(row.trialEndsAt!.getTime()).toBe(sub.trialEndsAt!.getTime() + 3 * 86_400_000);
    expect(iso(row.currentPeriodEnd)).toBe(iso(row.trialEndsAt));
    expect(await db.auditLog.count({ where: { action: "subscription.set_start_date", entityId: sub.id } })).toBe(1);
    expect(await db.notification.count({ where: { userId: s.user.id, type: "start_date_changed" } })).toBe(1);
  });

  it("moves the whole paid period of a Razorpay plan", async () => {
    const { m, pp, s, admin } = await usSetup(0);
    await db.market.update({ where: { id: m.id }, data: { paymentProvider: "RAZORPAY" } });
    const sub = await db.subscription.create({
      data: { studentId: s.student.id, planPriceId: pp.id, status: "ACTIVE", provider: "RAZORPAY", providerSubId: "order_x", currentPeriodStart: new Date("2026-11-25T17:00:00Z"), currentPeriodEnd: new Date("2026-12-25T17:00:00Z"), serviceStartAt: new Date("2026-11-25T17:00:00Z") },
    });
    await setServiceStartDate({ id: admin.id, role: "ADMIN" }, { subscriptionId: sub.id, startsAt: new Date("2026-11-30T17:00:00Z") }, new Date("2026-11-23T12:00:00Z"));
    const row = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(iso(row.currentPeriodStart)).toBe("2026-11-30T17:00:00.000Z");
    expect(iso(row.currentPeriodEnd)).toBe("2026-12-30T17:00:00.000Z");
  });

  it("is refused for non-admins and for plans that aren't active", async () => {
    const { sub, admin } = await activeTrial();
    const later = new Date(sub.serviceStartAt!.getTime() + 86_400_000);
    await expect(setServiceStartDate({ id: admin.id, role: "MANAGER" }, { subscriptionId: sub.id, startsAt: later })).rejects.toThrow(/admin/i);
    await db.subscription.update({ where: { id: sub.id }, data: { status: "CANCELED" } });
    await expect(setServiceStartDate({ id: admin.id, role: "ADMIN" }, { subscriptionId: sub.id, startsAt: later })).rejects.toThrow(/active/i);
  });
});
