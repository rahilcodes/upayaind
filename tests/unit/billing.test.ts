import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { processWebhookEvent } from "@/server/services/billing/webhooks";
import { buildCheckoutCompletedEvent, buildPaymentFailedEvent, buildRenewalPaidEvent } from "@/server/services/billing/simulate";
import { completeSimulatedCheckout, getCheckoutQuote, startCheckout } from "@/server/services/billing/checkout";
import { nextInvoiceNumber, formatInvoiceNumber } from "@/server/services/billing/invoice-number";
import { assertPriceFloor, savePrice, setPriceActive, saveMarket } from "@/server/services/billing/catalog-admin";
import { checkCoupon, validateCoupon } from "@/server/services/billing/coupons";
import { dueReminder, runRenewalReminders, runSubscriptionStatusSweep } from "@/server/services/billing/renewals";
import { refundPayment } from "@/server/services/billing/payments-admin";
import { makeEmployee, makeMarket, makeStudent, resetDb, uid } from "../setup/db";

beforeEach(async () => {
  await resetDb();
});

async function makePlanPrice(marketId: string, opts: { amountMinor?: number; interval?: "MONTHLY" | "QUARTERLY" | "ONE_TIME"; isActive?: boolean } = {}) {
  const plan = await db.plan.create({ data: { code: uid("plan"), name: "Standard", features: ["A", "B"] } });
  return db.planPrice.create({
    data: { planId: plan.id, marketId, interval: opts.interval ?? "MONTHLY", amountMinor: opts.amountMinor ?? 29900, currency: "USD", dailyTarget: 35, isActive: opts.isActive ?? true },
  });
}

async function pendingSub(studentId: string, planPriceId: string) {
  return db.subscription.create({ data: { studentId, planPriceId, status: "PENDING_PAYMENT", provider: "STRIPE" } });
}

async function setup(opts: { interval?: "MONTHLY" | "ONE_TIME" } = {}) {
  const m = await makeMarket();
  const pp = await makePlanPrice(m.id, { interval: opts.interval });
  const s = await makeStudent(m.id);
  const sub = await pendingSub(s.student.id, pp.id);
  return { m, pp, s, sub };
}

describe("webhook processing", () => {
  it("is idempotent: the same event twice creates one Payment and one invoice", async () => {
    const { s, sub } = await setup();
    const evt = await buildCheckoutCompletedEvent(sub.id);
    const a = await processWebhookEvent("STRIPE", evt);
    const b = await processWebhookEvent("STRIPE", evt);
    expect(a.status).toBe("processed");
    expect(b.status).toBe("duplicate");
    const payments = await db.payment.findMany({ where: { studentId: s.student.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: "SUCCEEDED", amountMinor: 29900, currency: "USD" });
    expect(payments[0]!.invoiceNumber).toMatch(/^UPY-\d{4}-\d{6}$/);
    expect(payments[0]!.invoiceKey).toBeTruthy();
    const files = await db.fileObject.findMany({ where: { purpose: "invoice", studentId: s.student.id } });
    expect(files).toHaveLength(1);
    expect(await db.webhookEvent.count({ where: { id: evt.id, processedAt: { not: null } } })).toBe(1);
  });

  it("does not double-record when checkout.session.completed and invoice.paid describe the same invoice", async () => {
    const { s, sub } = await setup();
    const evt = await buildCheckoutCompletedEvent(sub.id);
    await processWebhookEvent("STRIPE", evt);
    const session = evt.data.object as { invoice: Record<string, unknown> };
    await processWebhookEvent("STRIPE", { id: `evt_inv_${uid()}`, type: "invoice.paid", created: evt.created, data: { object: session.invoice } });
    expect(await db.payment.count({ where: { studentId: s.student.id } })).toBe(1);
  });

  it("concurrent duplicate deliveries still produce one Payment", async () => {
    const { s, sub } = await setup();
    const evt = await buildCheckoutCompletedEvent(sub.id);
    const results = await Promise.all([processWebhookEvent("STRIPE", evt), processWebhookEvent("STRIPE", evt), processWebhookEvent("STRIPE", evt)]);
    expect(results.filter((r) => r.status === "processed")).toHaveLength(1);
    expect(results.every((r) => ["processed", "duplicate", "in_progress"].includes(r.status))).toBe(true);
    expect(await db.payment.count({ where: { studentId: s.student.id } })).toBe(1);
  });

  it("a failed processing attempt can be retried by the next delivery", async () => {
    const { sub } = await setup();
    const evt = await buildCheckoutCompletedEvent(sub.id);
    await db.webhookEvent.create({ data: { id: evt.id, provider: "STRIPE", type: evt.type, payload: {}, error: "boom" } });
    expect((await processWebhookEvent("STRIPE", evt)).status).toBe("processed");
  });

  it("activates the subscription with its period and triggers auto-assignment", async () => {
    const { m, s, sub } = await setup();
    const emp = await makeEmployee(m.id);
    await processWebhookEvent("STRIPE", await buildCheckoutCompletedEvent(sub.id));
    const after = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.currentPeriodStart).toBeInstanceOf(Date);
    expect(after.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * 86_400_000);
    expect(after.providerSubId).toBe(`sub_sim_${sub.id}`);
    const assignment = await db.assignment.findFirst({ where: { studentId: s.student.id, isActive: true } });
    expect(assignment?.employeeId).toBe(emp.employee.id);
    expect(await db.notification.count({ where: { userId: s.user.id, type: "payment_succeeded" } })).toBe(1);
  });

  it("ONE_TIME plans activate from a payment-mode session with a computed period", async () => {
    const { sub } = await setup({ interval: "ONE_TIME" });
    const evt = await buildCheckoutCompletedEvent(sub.id);
    expect((evt.data.object as { mode: string }).mode).toBe("payment");
    await processWebhookEvent("STRIPE", evt);
    const after = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.providerSubId).toBeNull();
    expect(await db.payment.count({ where: { subscriptionId: sub.id, status: "SUCCEEDED" } })).toBe(1);
  });

  it("renewal invoice.paid extends the period with a new sequential invoice", async () => {
    const { sub } = await setup();
    await processWebhookEvent("STRIPE", await buildCheckoutCompletedEvent(sub.id));
    const first = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    await db.subscription.update({ where: { id: sub.id }, data: { remindersSent: ["T7:x"] } });
    await processWebhookEvent("STRIPE", await buildRenewalPaidEvent(sub.id));
    const second = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(second.currentPeriodEnd!.getTime()).toBeGreaterThan(first.currentPeriodEnd!.getTime());
    expect(second.remindersSent).toEqual([]);
    const numbers = (await db.payment.findMany({ where: { subscriptionId: sub.id }, orderBy: { createdAt: "asc" } })).map((p) => p.invoiceNumber!);
    expect(numbers).toHaveLength(2);
    expect(Number(numbers[1]!.slice(-6))).toBe(Number(numbers[0]!.slice(-6)) + 1);
  });

  it("invoice.payment_failed → PAST_DUE, FAILED payment, student + managers notified", async () => {
    const { s, sub } = await setup();
    const admin = await db.user.create({ data: { email: `${uid("a")}@t.test`, name: "Admin", role: "ADMIN" } });
    await processWebhookEvent("STRIPE", await buildCheckoutCompletedEvent(sub.id));
    await processWebhookEvent("STRIPE", await buildPaymentFailedEvent(sub.id));
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("PAST_DUE");
    expect(await db.payment.count({ where: { subscriptionId: sub.id, status: "FAILED" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: s.user.id, type: "payment_failed" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: admin.id, type: "payment_failed_admin" } })).toBe(1);
  });

  it("customer.subscription.updated/deleted sync cancelAtPeriodEnd and CANCELED", async () => {
    const { sub } = await setup();
    await processWebhookEvent("STRIPE", await buildCheckoutCompletedEvent(sub.id));
    const local = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    const stripeSub = (cancel: boolean, status = "active") => ({
      id: local.providerSubId,
      object: "subscription",
      status,
      cancel_at_period_end: cancel,
      cancel_at: null,
      metadata: { subscriptionId: sub.id },
      items: { data: [{ current_period_start: Math.floor(local.currentPeriodStart!.getTime() / 1000), current_period_end: Math.floor(local.currentPeriodEnd!.getTime() / 1000), price: { id: "price_x" } }] },
    });
    await processWebhookEvent("STRIPE", { id: `evt_${uid()}`, type: "customer.subscription.updated", created: 1, data: { object: stripeSub(true) } });
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).cancelAtPeriodEnd).toBe(true);
    await processWebhookEvent("STRIPE", { id: `evt_${uid()}`, type: "customer.subscription.deleted", created: 2, data: { object: stripeSub(false, "canceled") } });
    const after = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.status).toBe("CANCELED");
    expect(after.cancelAtPeriodEnd).toBe(false);
  });

  it("unknown event types are recorded and ignored", async () => {
    const r = await processWebhookEvent("STRIPE", { id: `evt_${uid()}`, type: "charge.updated", created: 1, data: { object: {} } });
    expect(r.status).toBe("ignored");
  });
});

describe("activation only via webhook", () => {
  it("startCheckout stores PENDING_PAYMENT and never activates", async () => {
    const m = await makeMarket();
    const pp = await makePlanPrice(m.id);
    const s = await makeStudent(m.id);
    const r = await startCheckout({ userId: s.user.id, studentId: s.student.id, email: s.user.email }, { planPriceId: pp.id });
    expect(r.kind).toBe("simulate");
    const subs = await db.subscription.findMany({ where: { studentId: s.student.id } });
    expect(subs).toHaveLength(1);
    expect(subs[0]!.status).toBe("PENDING_PAYMENT");
    expect(await db.payment.count()).toBe(0);
    expect(await db.productEvent.count({ where: { name: "checkout_started", userId: s.user.id } })).toBe(1);
    // Starting again reuses the same pending row.
    await startCheckout({ userId: s.user.id, studentId: s.student.id, email: s.user.email }, { planPriceId: pp.id });
    expect(await db.subscription.count({ where: { studentId: s.student.id } })).toBe(1);
  });

  it("a subscription.updated 'active' event does not activate a never-paid subscription", async () => {
    const { sub } = await setup();
    await db.subscription.update({ where: { id: sub.id }, data: { providerSubId: "sub_x1" } });
    await processWebhookEvent("STRIPE", {
      id: `evt_${uid()}`,
      type: "customer.subscription.updated",
      created: 1,
      data: { object: { id: "sub_x1", status: "active", cancel_at_period_end: false, metadata: {}, items: { data: [] } } },
    });
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("the simulated checkout goes through the webhook processor (WebhookEvent recorded)", async () => {
    const { s, sub } = await setup();
    const r = await completeSimulatedCheckout({ userId: s.user.id, studentId: s.student.id }, { subscriptionId: sub.id });
    expect(r.status).toBe("processed");
    expect(await db.webhookEvent.count({ where: { type: "checkout.session.completed", processedAt: { not: null } } })).toBe(1);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("ACTIVE");
    await expect(completeSimulatedCheckout({ userId: s.user.id, studentId: s.student.id }, { subscriptionId: sub.id })).rejects.toThrow(/already completed/);
  });

  it("another student can't complete someone else's checkout", async () => {
    const { m, sub } = await setup();
    const other = await makeStudent(m.id);
    await expect(completeSimulatedCheckout({ userId: other.user.id, studentId: other.student.id }, { subscriptionId: sub.id })).rejects.toThrow(/not found/);
  });
});

describe("price floor guard", () => {
  it("pure check: active below the floor throws, inactive placeholder is allowed", () => {
    const market = { minPriceMinor: 4900, currency: "USD" };
    expect(() => assertPriceFloor({ amountMinor: 4899, isActive: true }, market)).toThrow(/below this market’s minimum/);
    expect(() => assertPriceFloor({ amountMinor: 0, isActive: false }, market)).not.toThrow();
    expect(() => assertPriceFloor({ amountMinor: 4900, isActive: true }, market)).not.toThrow();
  });

  it("savePrice/setPriceActive enforce it and audit every change", async () => {
    const m = await makeMarket();
    const admin = await db.user.create({ data: { email: `${uid("a")}@t.test`, name: "Admin", role: "ADMIN" } });
    const plan = await db.plan.create({ data: { code: uid("p"), name: "Basic", features: [] } });
    const base = { planId: plan.id, marketId: m.id, interval: "MONTHLY" as const, dailyTarget: 25 };
    await expect(savePrice(admin.id, { ...base, amountMinor: 100, isActive: true })).rejects.toThrow(/minimum/);
    const placeholder = await savePrice(admin.id, { ...base, amountMinor: 0, isActive: false });
    await expect(setPriceActive(admin.id, placeholder.id, true)).rejects.toThrow(/minimum/);
    await savePrice(admin.id, { ...base, amountMinor: 19900, isActive: true, providerPriceId: "price_abc" });
    // Changing the amount clears a now-stale Stripe price id.
    const changed = await savePrice(admin.id, { ...base, amountMinor: 24900, isActive: true, providerPriceId: "price_abc" });
    expect(changed.providerPriceId).toBeNull();
    expect(await db.auditLog.count({ where: { entity: "PlanPrice", entityId: placeholder.id } })).toBe(3);
  });

  it("checkout blocks placeholder and inactive prices", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    const placeholder = await makePlanPrice(m.id, { amountMinor: 0 });
    const inactive = await makePlanPrice(m.id, { isActive: false });
    const who = { userId: s.user.id, studentId: s.student.id };
    await expect(getCheckoutQuote(who, placeholder.id)).rejects.toThrow(/hasn’t been set/);
    await expect(getCheckoutQuote(who, inactive.id)).rejects.toThrow(/no longer available/);
  });

  it("raising a market minimum is refused while active prices sit below it", async () => {
    const m = await makeMarket();
    const admin = await db.user.create({ data: { email: `${uid("a")}@t.test`, name: "Admin", role: "ADMIN" } });
    await makePlanPrice(m.id, { amountMinor: 5000 });
    await expect(
      saveMarket(admin.id, { id: m.id, code: "US", name: "United States", currency: "USD", locale: "en-US", defaultTimezone: "America/New_York", workingDays: [1, 2, 3, 4, 5], paymentProvider: "STRIPE", minPriceMinor: 9900, resumeStyleId: m.resumeStyleId, isActive: true }),
    ).rejects.toThrow(/below the new minimum/);
  });
});

describe("invoice numbering", () => {
  it("formats UPY-<year>-<6 digits>", () => {
    expect(formatInvoiceNumber(2026, 42)).toBe("UPY-2026-000042");
  });

  it("is sequential and unique under concurrency", async () => {
    const at = new Date("2026-03-01T00:00:00Z");
    const nums = await Promise.all(Array.from({ length: 25 }, () => db.$transaction((tx) => nextInvoiceNumber(tx, at))));
    expect(new Set(nums).size).toBe(25);
    const seqs = nums.map((n) => Number(n.slice(-6))).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });

  it("continues after existing (imported) invoice numbers for the year", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    await db.payment.create({ data: { studentId: s.student.id, amountMinor: 100, currency: "USD", status: "SUCCEEDED", provider: "MANUAL", invoiceNumber: "UPY-2027-000041" } });
    expect(await nextInvoiceNumber(db, new Date("2027-05-01T00:00:00Z"))).toBe("UPY-2027-000042");
  });

  it("concurrent webhooks for different students get distinct numbers", async () => {
    const m = await makeMarket();
    const pp = await makePlanPrice(m.id);
    const subs = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const s = await makeStudent(m.id);
        return pendingSub(s.student.id, pp.id);
      }),
    );
    const events = await Promise.all(subs.map((s) => buildCheckoutCompletedEvent(s.id)));
    await Promise.all(events.map((e) => processWebhookEvent("STRIPE", e)));
    const numbers = (await db.payment.findMany({ select: { invoiceNumber: true } })).map((p) => p.invoiceNumber);
    expect(numbers).toHaveLength(6);
    expect(new Set(numbers).size).toBe(6);
  });
});

describe("coupons", () => {
  const base = { id: "c1", code: "SAVE", percentOff: 10, amountOffMinor: null, currency: null, maxRedemptions: null, redeemed: 0, validFrom: null, validTo: null, planPriceIds: [] as string[], providerCouponId: null, isActive: true };
  const price = { id: "pp1", amountMinor: 20000, currency: "USD" };
  const now = new Date("2026-06-01T00:00:00Z");

  it("computes percent and fixed discounts (never below zero)", () => {
    expect(checkCoupon(base, price, now)).toMatchObject({ discountMinor: 2000, finalMinor: 18000 });
    expect(checkCoupon({ ...base, percentOff: null, amountOffMinor: 50000, currency: "USD" }, price, now)).toMatchObject({ discountMinor: 20000, finalMinor: 0 });
  });

  it("rejects inactive, expired, not-yet-valid, exhausted, wrong plan and wrong currency", () => {
    expect(() => checkCoupon({ ...base, isActive: false }, price, now)).toThrow(/no longer active/);
    expect(() => checkCoupon({ ...base, validTo: new Date("2026-05-01") }, price, now)).toThrow(/expired/);
    expect(() => checkCoupon({ ...base, validFrom: new Date("2026-07-01") }, price, now)).toThrow(/isn’t valid yet/);
    expect(() => checkCoupon({ ...base, maxRedemptions: 3, redeemed: 3 }, price, now)).toThrow(/limit/);
    expect(() => checkCoupon({ ...base, planPriceIds: ["other"] }, price, now)).toThrow(/doesn’t apply/);
    expect(() => checkCoupon({ ...base, percentOff: null, amountOffMinor: 500, currency: "GBP" }, price, now)).toThrow(/currency/);
  });

  it("validateCoupon looks codes up case-insensitively and errors on unknown codes", async () => {
    const m = await makeMarket();
    const pp = await makePlanPrice(m.id);
    await db.coupon.create({ data: { code: "WELCOME10", percentOff: 10 } });
    const r = await validateCoupon("welcome10", { id: pp.id, amountMinor: pp.amountMinor, currency: "USD" });
    expect(r.discountMinor).toBe(2990);
    await expect(validateCoupon("NOPE", { id: pp.id, amountMinor: 100, currency: "USD" })).rejects.toThrow(/isn’t valid/);
  });

  it("a coupon used at checkout is redeemed once and discounts the invoice", async () => {
    const { s, sub } = await setup();
    const c = await db.coupon.create({ data: { code: "HALF", percentOff: 50, maxRedemptions: 1 } });
    await completeSimulatedCheckout({ userId: s.user.id, studentId: s.student.id }, { subscriptionId: sub.id, coupon: "HALF" });
    expect((await db.coupon.findUniqueOrThrow({ where: { id: c.id } })).redeemed).toBe(1);
    expect((await db.payment.findFirstOrThrow({ where: { subscriptionId: sub.id } })).amountMinor).toBe(14950);
  });
});

describe("renewal reminders", () => {
  it("dueReminder picks T-7 then T-2, keyed by period end", () => {
    const end = new Date("2026-06-10T12:00:00Z");
    expect(dueReminder(end, [], new Date("2026-06-01T12:00:00Z"))).toBeNull();
    expect(dueReminder(end, [], new Date("2026-06-03T13:00:00Z"))).toMatchObject({ key: "T7:2026-06-10", days: 7 });
    expect(dueReminder(end, ["T7:2026-06-10"], new Date("2026-06-04T13:00:00Z"))).toBeNull();
    expect(dueReminder(end, ["T7:2026-06-10"], new Date("2026-06-08T13:00:00Z"))).toMatchObject({ key: "T2:2026-06-10", days: 2 });
    expect(dueReminder(end, ["T7:2026-06-10", "T2:2026-06-10"], new Date("2026-06-09T13:00:00Z"))).toBeNull();
  });

  it("sends each reminder once even when runs overlap, and notifies the employee for ending plans", async () => {
    const m = await makeMarket();
    const pp = await makePlanPrice(m.id, { interval: "ONE_TIME" });
    const s = await makeStudent(m.id);
    const emp = await makeEmployee(m.id);
    await db.assignment.create({ data: { studentId: s.student.id, employeeId: emp.employee.id, source: "AUTO" } });
    const now = new Date();
    await db.subscription.create({
      data: { studentId: s.student.id, planPriceId: pp.id, status: "ACTIVE", provider: "STRIPE", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 6.5 * 86_400_000) },
    });
    await Promise.all([runRenewalReminders(now), runRenewalReminders(now), runRenewalReminders(now)]);
    await runRenewalReminders(now);
    expect(await db.notification.count({ where: { userId: s.user.id, type: "renewal_reminder" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: emp.user.id, type: "student_expiring" } })).toBe(1);
    // Five days later → the T-2 reminder, once.
    const later = new Date(now.getTime() + 5 * 86_400_000);
    await runRenewalReminders(later);
    await runRenewalReminders(later);
    expect(await db.notification.count({ where: { userId: s.user.id, type: "renewal_reminder" } })).toBe(2);
  });

  it("auto-renewing plans remind the student but don't flag the employee", async () => {
    const { m, s, sub } = await setup();
    const emp = await makeEmployee(m.id);
    await processWebhookEvent("STRIPE", await buildCheckoutCompletedEvent(sub.id));
    const end = (await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).currentPeriodEnd!;
    await runRenewalReminders(new Date(end.getTime() - 3 * 86_400_000));
    expect(await db.notification.count({ where: { userId: s.user.id, type: "renewal_reminder" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: emp.user.id, type: "student_expiring" } })).toBe(0);
  });

  it("nightly sweep expires ONE_TIME plans at period end and marks missed renewals PAST_DUE", async () => {
    const m = await makeMarket();
    const once = await makePlanPrice(m.id, { interval: "ONE_TIME" });
    const monthly = await makePlanPrice(m.id);
    const a = await makeStudent(m.id);
    const b = await makeStudent(m.id);
    const past = new Date(Date.now() - 4 * 86_400_000);
    const s1 = await db.subscription.create({ data: { studentId: a.student.id, planPriceId: once.id, status: "ACTIVE", provider: "STRIPE", currentPeriodEnd: past } });
    const s2 = await db.subscription.create({ data: { studentId: b.student.id, planPriceId: monthly.id, status: "ACTIVE", provider: "STRIPE", providerSubId: "sub_live", currentPeriodEnd: past } });
    const r = await runSubscriptionStatusSweep();
    expect(r.changed).toBe(2);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: s1.id } })).status).toBe("EXPIRED");
    expect((await db.subscription.findUniqueOrThrow({ where: { id: s2.id } })).status).toBe("PAST_DUE");
    expect((await runSubscriptionStatusSweep()).changed).toBe(0);
  });
});

describe("refunds", () => {
  it("manual payments refund partially then fully, audit-logged, never over-refunded", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    const admin = await db.user.create({ data: { email: `${uid("a")}@t.test`, name: "Admin", role: "ADMIN" } });
    const p = await db.payment.create({ data: { studentId: s.student.id, amountMinor: 10000, currency: "USD", status: "SUCCEEDED", provider: "MANUAL", invoiceNumber: "UPY-2026-000900" } });
    expect((await refundPayment(admin, { paymentId: p.id, amountMinor: 4000, reason: "Partial goodwill" })).status).toBe("PARTIALLY_REFUNDED");
    await expect(refundPayment(admin, { paymentId: p.id, amountMinor: 7000, reason: "Too much" })).rejects.toThrow(/larger than/);
    expect((await refundPayment(admin, { paymentId: p.id, amountMinor: 6000, reason: "Rest" })).status).toBe("REFUNDED");
    expect(await db.auditLog.count({ where: { action: "payment.refund", entityId: p.id } })).toBe(2);
  });

  it("simulated payments can't be refunded through a provider", async () => {
    const { sub } = await setup();
    const admin = await db.user.create({ data: { email: `${uid("a")}@t.test`, name: "Admin", role: "ADMIN" } });
    await processWebhookEvent("STRIPE", await buildCheckoutCompletedEvent(sub.id));
    const p = await db.payment.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    await expect(refundPayment(admin, { paymentId: p.id, amountMinor: 100, reason: "test" })).rejects.toThrow(/live payment provider/);
  });
});
