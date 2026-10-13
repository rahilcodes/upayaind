import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { attributeReferral, generateReferralCode, getOrCreateReferralCode, getReferralSummary, onFirstPaymentSucceeded, referralCouponFor } from "@/server/services/referrals";
import { makeMarket, makeStudent, resetDb } from "../setup/db";

vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => ({ id: "dev" })) }));

describe("referral programme (D-113)", () => {
  beforeEach(resetDb);

  it("generates unique, unambiguous codes and keeps one code per student", async () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateReferralCode()));
    expect(codes.size).toBe(500);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    const m = await makeMarket();
    const a = await makeStudent(m.id, "Asha");
    const [c1, c2] = await Promise.all([getOrCreateReferralCode(a.student.id), getOrCreateReferralCode(a.student.id)]);
    expect(c1).toBe(c2);
    const b = await makeStudent(m.id, "Ben");
    expect(await getOrCreateReferralCode(b.student.id)).not.toBe(c1);
  });

  it("attributes a signup to the referrer, ignores self/unknown codes and double attribution", async () => {
    const m = await makeMarket();
    const ref = await makeStudent(m.id, "Asha Referrer");
    const code = await getOrCreateReferralCode(ref.student.id);
    const friend = await makeStudent(m.id, "Ben Friend");

    expect(await attributeReferral(friend.student.id, "NOPE1234")).toBeNull();
    expect(await attributeReferral(ref.student.id, code)).toBeNull(); // self
    const id = await attributeReferral(friend.student.id, code.toLowerCase());
    expect(id).toBeTruthy();
    expect(await attributeReferral(friend.student.id, code)).toBeNull(); // already attributed

    const fp = await db.studentProfile.findUniqueOrThrow({ where: { id: friend.student.id } });
    expect(fp.referredById).toBe(ref.student.id);
    const r = await db.referral.findUniqueOrThrow({ where: { referredId: friend.student.id } });
    expect(r.status).toBe("PENDING");
    expect(r.currency).toBe("USD");
    expect(r.creditMinor).toBe(2500);
    expect(await db.notification.count({ where: { userId: ref.user.id, type: "referral_joined" } })).toBe(1);
    expect(await referralCouponFor(friend.student.id)).toBe("REFERRAL10");
    expect(await db.coupon.findUnique({ where: { code: "REFERRAL10" } })).toMatchObject({ percentOff: 10, isActive: true });
  });

  it("credits the referrer exactly once on the friend's first payment (concurrent + repeated calls)", async () => {
    const m = await makeMarket();
    const ref = await makeStudent(m.id, "Asha");
    const code = await getOrCreateReferralCode(ref.student.id);
    const friend = await makeStudent(m.id, "Ben");
    await attributeReferral(friend.student.id, code);

    const results = await Promise.all([onFirstPaymentSucceeded(friend.student.id), onFirstPaymentSucceeded(friend.student.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await onFirstPaymentSucceeded(friend.student.id)).toBeNull();

    const r = await db.referral.findUniqueOrThrow({ where: { referredId: friend.student.id } });
    expect(r.status).toBe("CREDITED");
    expect(r.creditedAt).not.toBeNull();
    expect(await db.notification.count({ where: { userId: ref.user.id, type: "referral_credited" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: friend.user.id, type: "referral_credited" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "referral.credited", entityId: r.id } })).toBe(1);

    const summary = await getReferralSummary({ id: ref.user.id, role: "STUDENT" });
    expect(summary.code).toBe(code);
    expect(summary.link).toContain(`/signup?ref=${code}`);
    expect(summary.earnedMinor).toBe(2500);
    expect(summary.referrals[0]).toMatchObject({ friendFirstName: "Ben", status: "CREDITED" });
    // A referred student who already paid no longer gets the friend coupon prefilled.
    await db.payment.create({ data: { studentId: friend.student.id, amountMinor: 100, currency: "USD", status: "SUCCEEDED", provider: "STRIPE", providerPaymentId: "pi_x" } });
    expect(await referralCouponFor(friend.student.id)).toBeNull();
  });

  it("does nothing for students who were not referred", async () => {
    const m = await makeMarket();
    const s = await makeStudent(m.id);
    expect(await onFirstPaymentSucceeded(s.student.id)).toBeNull();
  });
});
