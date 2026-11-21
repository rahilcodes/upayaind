import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

// Razorpay keys for the pure helpers (set before `@/env` is evaluated); the REST client is mocked via fetch.
vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_key";
  process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
});

import { db } from "@/server/db";
import { paymentToEvent, razorpayProvider, verifyCheckoutSignature, verifyWebhookSignature, type RazorpayPayment } from "@/server/services/billing/razorpay";
import { processWebhookEvent } from "@/server/services/billing/webhooks";
import { runSubscriptionStatusSweep, willAutoRenew } from "@/server/services/billing/renewals";
import { checkoutBlock, getCheckoutQuote } from "@/server/services/billing/checkout";
import { makeEmployee, makeMarket, makeStudent, resetDb, uid } from "../setup/db";

/** Razorpay for India (D-158): order creation, signatures, and payment.captured → one period of the plan. */

const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

describe("signatures", () => {
  it("verifies the Checkout.js callback and the webhook body, and rejects tampering", () => {
    expect(verifyCheckoutSignature("order_1", "pay_1", sign("rzp_test_secret", "order_1|pay_1"))).toBe(true);
    expect(verifyCheckoutSignature("order_1", "pay_2", sign("rzp_test_secret", "order_1|pay_1"))).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", null)).toBe(false);
    const body = JSON.stringify({ event: "payment.captured", created_at: 1, payload: { payment: { entity: { id: "pay_1" } } } });
    expect(verifyWebhookSignature(body, sign("whsec_test", body))).toBe(true);
    expect(verifyWebhookSignature(body + " ", sign("whsec_test", body))).toBe(false);
  });

  it("verifyWebhook parses the payment entity into a stable event id", async () => {
    const body = JSON.stringify({ event: "payment.captured", created_at: 1700000000, payload: { payment: { entity: { id: "pay_9", order_id: "order_9", amount: 1299900, currency: "INR", status: "captured", created_at: 1700000000 } } } });
    const ev = await razorpayProvider.verifyWebhook(body, sign("whsec_test", body));
    expect(ev).toMatchObject({ id: "rzp_payment.captured_pay_9", type: "payment.captured" });
    await expect(razorpayProvider.verifyWebhook(body, "bad")).rejects.toThrow(/signature/);
  });
});

describe("createCheckoutSession", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("creates an order for the discounted amount with the local ids in notes and returns our checkout page", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "order_abc", amount: 1199900, currency: "INR", status: "created" }), { status: 200 }));
    const r = await razorpayProvider.createCheckoutSession({
      mode: "payment",
      localSubscriptionId: "sub_local_1",
      studentId: "stu_1",
      planPriceId: "pp_1",
      customerEmail: "a@b.test",
      line: { amountMinor: 1299900, currency: "INR", productName: "UpayaInd Premium", interval: "QUARTERLY" },
      discountMinor: 100000,
      successUrl: "https://x/ok",
      cancelUrl: "https://x/cancel",
      metadata: { subscriptionId: "sub_local_1", studentId: "stu_1", planPriceId: "pp_1", couponId: "c1" },
    });
    expect(r.id).toBe("order_abc");
    expect(r.url).toContain("/app/checkout/razorpay?order=order_abc");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ amount: 1199900, currency: "INR", receipt: "sub_local_1", payment_capture: 1, notes: { subscriptionId: "sub_local_1", couponId: "c1", discountMinor: "100000" } });
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("surfaces Razorpay's error description", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { description: "Amount exceeds maximum" } }), { status: 400 }));
    await expect(
      razorpayProvider.createCheckoutSession({ mode: "payment", localSubscriptionId: "s", studentId: "x", planPriceId: "p", customerEmail: "a@b.test", line: { amountMinor: 500000, currency: "INR", productName: "P", interval: "QUARTERLY" }, successUrl: "", cancelUrl: "", metadata: {} }),
    ).rejects.toThrow(/Amount exceeds maximum/);
  });
});

describe("payment.captured → plan activation", () => {
  beforeEach(resetDb);

  async function pendingRazorpaySub() {
    const m = await makeMarket("IN");
    await db.market.update({ where: { id: m.id }, data: { currency: "INR", paymentProvider: "RAZORPAY" } });
    const plan = await db.plan.create({ data: { code: uid("in_prem"), name: "Premium", features: ["A"] } });
    const pp = await db.planPrice.create({ data: { planId: plan.id, marketId: m.id, interval: "QUARTERLY", amountMinor: 1499900, currency: "INR", dailyTarget: 18 } });
    const s = await makeStudent(m.id);
    await makeEmployee(m.id);
    const sub = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: pp.id, status: "PENDING_PAYMENT", provider: "RAZORPAY", providerSubId: "order_live_1", remindersSent: [] } });
    return { s, sub, pp };
  }

  const captured = (over: Partial<RazorpayPayment> = {}): RazorpayPayment => ({
    id: "pay_live_1",
    order_id: "order_live_1",
    amount: 1499900,
    currency: "INR",
    status: "captured",
    method: "upi",
    created_at: Math.floor(new Date("2026-11-10T06:00:00Z").getTime() / 1000),
    notes: { subscriptionId: "", discountMinor: "0" },
    ...over,
  });

  it("activates the pending plan for one QUARTERLY period, records the payment with the method, and is idempotent", async () => {
    const { s, sub } = await pendingRazorpaySub();
    const r1 = await processWebhookEvent("RAZORPAY", paymentToEvent(captured()));
    expect(r1.status).toBe("processed");
    const active = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(active.status).toBe("ACTIVE");
    expect(active.currentPeriodStart!.toISOString()).toBe("2026-11-10T06:00:00.000Z");
    expect(active.currentPeriodEnd!.toISOString()).toBe("2027-02-10T06:00:00.000Z");
    const pay = await db.payment.findUniqueOrThrow({ where: { providerPaymentId: "pay_live_1" } });
    expect(pay).toMatchObject({ status: "SUCCEEDED", provider: "RAZORPAY", amountMinor: 1499900, currency: "INR", method: "upi", subscriptionId: sub.id });
    expect(pay.invoiceNumber).toMatch(/^UPY-/);
    expect((await db.assignment.findFirst({ where: { studentId: s.student.id, isActive: true } }))).not.toBeNull();
    // The browser callback and a webhook retry both deliver the same event id → duplicate, nothing doubled.
    const r2 = await processWebhookEvent("RAZORPAY", paymentToEvent(captured()));
    expect(r2.status).toBe("duplicate");
    expect(await db.payment.count({ where: { studentId: s.student.id } })).toBe(1);
  });

  it("ignores non-captured payments and unknown orders", async () => {
    await pendingRazorpaySub();
    const r = await processWebhookEvent("RAZORPAY", paymentToEvent(captured({ id: "pay_x", status: "failed" }), "payment.captured"));
    expect(r.detail).toBe("payment failed");
    const r2 = await processWebhookEvent("RAZORPAY", paymentToEvent(captured({ id: "pay_y", order_id: "order_nope" })));
    expect(r2.detail).toBe("no local subscription");
  });

  it("expires at the period end instead of going past due (no auto-renewal)", async () => {
    const { sub } = await pendingRazorpaySub();
    await processWebhookEvent("RAZORPAY", paymentToEvent(captured()));
    await runSubscriptionStatusSweep(new Date("2027-02-11T00:00:00Z"));
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("EXPIRED");
  });
});

/** D-168: every market except the US pays through Razorpay, one payment per period, renewable before the end date. */
describe("non-US markets on Razorpay (D-168)", () => {
  beforeEach(resetDb);

  async function ukStudentWithPlans() {
    const m = await makeMarket("UK");
    await db.market.update({ where: { id: m.id }, data: { currency: "GBP", paymentProvider: "RAZORPAY", minPriceMinor: 3900 } });
    const standard = await db.plan.create({ data: { code: uid("uk_std"), name: "Standard", features: ["A"] } });
    const premium = await db.plan.create({ data: { code: uid("uk_prem"), name: "Premium", features: ["A"] } });
    const std = await db.planPrice.create({ data: { planId: standard.id, marketId: m.id, interval: "MONTHLY", amountMinor: 19900, currency: "GBP", dailyTarget: 35 } });
    const prem = await db.planPrice.create({ data: { planId: premium.id, marketId: m.id, interval: "MONTHLY", amountMinor: 29900, currency: "GBP", dailyTarget: 45 } });
    const s = await makeStudent(m.id);
    await makeEmployee(m.id);
    return { m, s, std, prem };
  }

  const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  const pay = (id: string, order: string, amount: number, iso: string): RazorpayPayment => ({ id, order_id: order, amount, currency: "GBP", status: "captured", method: "card", created_at: at(iso), notes: { discountMinor: "0" } });

  it("quotes a monthly GBP plan as one payment per period, not an auto-renewing subscription", async () => {
    const { s, std } = await ukStudentWithPlans();
    const q = await getCheckoutQuote({ userId: s.user.id, studentId: s.student.id }, std.id);
    expect(q).toMatchObject({ paymentProvider: "RAZORPAY", recurring: false, currency: "GBP", amountMinor: 19900, extendsFrom: null });
  });

  it("renewing the same plan before it ends adds the new period after the current one", async () => {
    const { s, std } = await ukStudentWithPlans();
    const first = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: std.id, status: "PENDING_PAYMENT", provider: "RAZORPAY", providerSubId: "order_uk_1", remindersSent: [] } });
    await processWebhookEvent("RAZORPAY", paymentToEvent(pay("pay_uk_1", "order_uk_1", 19900, "2026-11-10T06:00:00Z")));
    expect((await db.subscription.findUniqueOrThrow({ where: { id: first.id } })).currentPeriodEnd!.toISOString()).toBe("2026-12-10T06:00:00.000Z");

    // A live Razorpay plan doesn't block paying again through Razorpay…
    expect(await checkoutBlock(s.student.id, "RAZORPAY")).toBeNull();
    // …but it would block buying a Stripe subscription on top of it.
    expect(await checkoutBlock(s.student.id, "STRIPE")).toBe("managed");

    const second = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: std.id, status: "PENDING_PAYMENT", provider: "RAZORPAY", providerSubId: "order_uk_2", remindersSent: [] } });
    await processWebhookEvent("RAZORPAY", paymentToEvent(pay("pay_uk_2", "order_uk_2", 19900, "2026-12-05T06:00:00Z")));
    const renewed = await db.subscription.findUniqueOrThrow({ where: { id: second.id } });
    expect(renewed.status).toBe("ACTIVE");
    expect(renewed.currentPeriodStart!.toISOString()).toBe("2026-12-10T06:00:00.000Z");
    expect(renewed.currentPeriodEnd!.toISOString()).toBe("2027-01-10T06:00:00.000Z");
    // One live plan per student: the old row is closed, both payments are kept.
    expect((await db.subscription.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("CANCELED");
    expect(await db.payment.count({ where: { studentId: s.student.id, status: "SUCCEEDED" } })).toBe(2);
  });

  it("switching to a different plan starts at once and replaces the current plan", async () => {
    const { s, std, prem } = await ukStudentWithPlans();
    await db.subscription.create({ data: { studentId: s.student.id, planPriceId: std.id, status: "PENDING_PAYMENT", provider: "RAZORPAY", providerSubId: "order_uk_3", remindersSent: [] } });
    await processWebhookEvent("RAZORPAY", paymentToEvent(pay("pay_uk_3", "order_uk_3", 19900, "2026-11-10T06:00:00Z")));
    const up = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: prem.id, status: "PENDING_PAYMENT", provider: "RAZORPAY", providerSubId: "order_uk_4", remindersSent: [] } });
    await processWebhookEvent("RAZORPAY", paymentToEvent(pay("pay_uk_4", "order_uk_4", 29900, "2026-11-20T06:00:00Z")));
    const row = await db.subscription.findUniqueOrThrow({ where: { id: up.id } });
    expect(row.currentPeriodStart!.toISOString()).toBe("2026-11-20T06:00:00.000Z");
    expect(row.currentPeriodEnd!.toISOString()).toBe("2026-12-20T06:00:00.000Z");
  });

  it("a live Stripe subscription or a paused plan blocks a new Razorpay checkout", async () => {
    const { s, std } = await ukStudentWithPlans();
    const row = await db.subscription.create({ data: { studentId: s.student.id, planPriceId: std.id, status: "ACTIVE", provider: "STRIPE", providerSubId: "sub_live_uk", currentPeriodEnd: new Date("2027-01-01T00:00:00Z"), remindersSent: [] } });
    expect(await checkoutBlock(s.student.id, "RAZORPAY")).toBe("managed");
    await db.subscription.update({ where: { id: row.id }, data: { provider: "RAZORPAY", status: "PAUSED" } });
    expect(await checkoutBlock(s.student.id, "RAZORPAY")).toBe("paused");
  });

  it("Razorpay plans never count as auto-renewing; Stripe subscriptions do", () => {
    const base = { providerSubId: "x", cancelAtPeriodEnd: false, planPrice: { interval: "MONTHLY" } };
    expect(willAutoRenew({ ...base, provider: "RAZORPAY" })).toBe(false);
    expect(willAutoRenew({ ...base, provider: "MANUAL" })).toBe(false);
    expect(willAutoRenew({ ...base, provider: "STRIPE" })).toBe(true);
  });
});
