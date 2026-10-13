import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/auth/access";
import { formatMoney } from "@/lib/format";
import { absoluteUrl, firstName } from "@/lib/utils";
import { audit } from "./audit";
import { providerFor } from "./billing/provider";
import { notify } from "./notify";
import { getSetting, setSetting } from "./settings";
import { trackEvent } from "./events";

/**
 * Referral programme (D-113).
 *
 * Every student gets a unique referral code (lazily). A friend who signs up with
 * `/signup?ref=CODE` (or within 30 days of visiting such a link — `ref` cookie)
 * is linked through `StudentProfile.referredById` + a PENDING `Referral` row.
 * The friend's first payment gets `settings.referral.friendPercentOff` via the
 * shared `Coupon` (code REFERRAL<percent>, auto-prefilled at checkout). When the
 * friend's first payment succeeds, the referrer's Referral flips to CREDITED
 * exactly once, a provider balance credit is recorded when Stripe is configured
 * (simulated/manual payments just record the row) and both sides are notified.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const REFERRAL_COOKIE = "ref";
export const REFERRAL_COOKIE_DAYS = 30;

export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6,12}$/, "Invalid referral code");

/** Pure: a random 8-char code from an unambiguous alphabet. */
export function generateReferralCode(length = 8) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

/** The student's referral code, created on first use (unique; retried on collision). */
export async function getOrCreateReferralCode(studentId: string): Promise<string> {
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { referralCode: true } });
  if (!s) throw new ForbiddenError();
  if (s.referralCode) return s.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      // Only set when still empty so two concurrent calls agree on one code.
      const r = await db.studentProfile.updateMany({ where: { id: studentId, referralCode: null }, data: { referralCode: code } });
      if (r.count === 1) return code;
      const again = await db.studentProfile.findUniqueOrThrow({ where: { id: studentId }, select: { referralCode: true } });
      if (again.referralCode) return again.referralCode;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // unique collision → retry
    }
  }
  throw new Error("Could not allocate a referral code");
}

export function referralLink(code: string) {
  return absoluteUrl(`/signup?ref=${encodeURIComponent(code)}`);
}

/** Coupon for the friend's first payment (shared, percent-based, one per configured percentage). */
export async function ensureReferralCoupon() {
  const { friendPercentOff } = await getSetting("referral");
  if (!friendPercentOff || friendPercentOff <= 0) return null;
  const code = `REFERRAL${Math.round(friendPercentOff)}`;
  const c = await db.coupon.upsert({
    where: { code },
    update: { percentOff: Math.round(friendPercentOff), isActive: true },
    create: { code, percentOff: Math.round(friendPercentOff), isActive: true },
    select: { id: true, code: true },
  });
  return c;
}

/** Coupon code to prefill at checkout for a referred student who hasn't paid yet (null otherwise). */
export async function referralCouponFor(studentId: string): Promise<string | null> {
  const s = await db.studentProfile.findUnique({ where: { id: studentId }, select: { referredById: true } });
  if (!s?.referredById) return null;
  const paid = await db.payment.count({ where: { studentId, status: { in: ["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED"] } } });
  if (paid > 0) return null;
  const c = await ensureReferralCoupon();
  return c?.code ?? null;
}

/**
 * Link a brand-new student to the referrer behind `code`. Silent no-op for
 * unknown codes, self-referrals or students already attributed.
 */
export async function attributeReferral(newStudentId: string, code: string | null | undefined, tx: Prisma.TransactionClient | typeof db = db) {
  const parsed = referralCodeSchema.safeParse(code ?? "");
  if (!parsed.success) return null;
  const referrer = await tx.studentProfile.findUnique({ where: { referralCode: parsed.data }, select: { id: true, userId: true, market: { select: { currency: true, locale: true } } } });
  if (!referrer || referrer.id === newStudentId) return null;
  const target = await tx.studentProfile.findUnique({ where: { id: newStudentId }, select: { referredById: true, user: { select: { name: true, status: true } } } });
  if (!target || target.referredById) return null;
  const credits = (await getSetting("referral")).referrerCreditMinor;
  const creditMinor = credits[referrer.market.currency] ?? 0;
  const [referral] = await Promise.all([
    tx.referral.create({ data: { referrerId: referrer.id, referredId: newStudentId, creditMinor, currency: referrer.market.currency }, select: { id: true } }),
    tx.studentProfile.update({ where: { id: newStudentId }, data: { referredById: referrer.id } }),
  ]);
  await trackEvent("referral_attributed", referrer.userId, { referralId: referral.id, referredStudentId: newStudentId });
  await notify(referrer.userId, "referral_joined", {
    friendName: firstName(target.user.name),
    credit: formatMoney(creditMinor, referrer.market.currency, referrer.market.locale),
  });
  return referral.id;
}

/**
 * Billing hook (called from webhooks.afterPayment): credit the referrer once,
 * on the referred student's first successful payment. Idempotent: the PENDING →
 * CREDITED transition is a conditional updateMany, so concurrent webhooks or a
 * second payment never credit twice.
 */
export async function onFirstPaymentSucceeded(studentId: string) {
  const pending = await db.referral.findFirst({
    where: { referredId: studentId, status: "PENDING" },
    select: {
      id: true,
      creditMinor: true,
      currency: true,
      referrer: { select: { id: true, userId: true, market: { select: { currency: true, locale: true, paymentProvider: true } } } },
      referred: { select: { userId: true, user: { select: { name: true } }, market: { select: { locale: true } } } },
    },
  });
  if (!pending) return null;
  const claimed = await db.referral.updateMany({ where: { id: pending.id, status: "PENDING" }, data: { status: "CREDITED", creditedAt: new Date() } });
  if (claimed.count !== 1) return null;

  const currency = pending.currency ?? pending.referrer.market.currency;
  const amount = formatMoney(pending.creditMinor, currency, pending.referrer.market.locale);

  // Provider credit (Stripe customer balance) when the referrer has a customer id and the gateway is configured.
  let providerCreditId: string | null = null;
  if (pending.creditMinor > 0) {
    const provider = providerFor(pending.referrer.market.paymentProvider);
    const sub = await db.subscription.findFirst({
      where: { studentId: pending.referrer.id, providerCustomerId: { not: null }, provider: provider.code },
      orderBy: { createdAt: "desc" },
      select: { providerCustomerId: true },
    });
    if (provider.isConfigured() && sub?.providerCustomerId && !sub.providerCustomerId.includes("_sim_")) {
      try {
        const r = await provider.applyCredit({
          customerId: sub.providerCustomerId,
          amountMinor: pending.creditMinor,
          currency,
          description: `UpayaInd referral credit (${firstName(pending.referred.user.name)})`,
          idempotencyKey: `referral_credit_${pending.id}`,
        });
        providerCreditId = r.creditId;
      } catch (e) {
        console.error("[referrals] provider credit failed; recorded locally only", pending.id, e);
      }
    }
  }
  await audit({
    actorId: pending.referred.userId,
    action: "referral.credited",
    entity: "Referral",
    entityId: pending.id,
    after: { referrerStudentId: pending.referrer.id, creditMinor: pending.creditMinor, currency, providerCreditId },
  });
  await trackEvent("referral_credited", pending.referrer.userId, { referralId: pending.id, creditMinor: pending.creditMinor, currency });
  await notify(pending.referrer.userId, "referral_credited", { friendName: firstName(pending.referred.user.name), credit: amount });
  const { friendPercentOff } = await getSetting("referral");
  if (friendPercentOff > 0) await notify(pending.referred.userId, "referral_credited", { credit: `${friendPercentOff}%` });
  return pending.id;
}

/** /app/referrals page data. */
export async function getReferralSummary(user: { id: string; role: string }) {
  if (user.role !== "STUDENT") throw new ForbiddenError();
  const s = await db.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true, market: { select: { currency: true, locale: true } } } });
  if (!s) throw new ForbiddenError();
  const code = await getOrCreateReferralCode(s.id);
  const [settings, rows] = await Promise.all([
    getSetting("referral"),
    db.referral.findMany({
      where: { referrerId: s.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, status: true, creditMinor: true, currency: true, createdAt: true, creditedAt: true, referred: { select: { user: { select: { name: true } } } } },
    }),
  ]);
  const currency = s.market.currency;
  const creditMinor = settings.referrerCreditMinor[currency] ?? 0;
  const earnedMinor = rows.filter((r) => r.status === "CREDITED" && (r.currency ?? currency) === currency).reduce((n, r) => n + r.creditMinor, 0);
  const pendingMinor = rows.filter((r) => r.status === "PENDING" && (r.currency ?? currency) === currency).reduce((n, r) => n + r.creditMinor, 0);
  return {
    code,
    link: referralLink(code),
    currency,
    locale: s.market.locale,
    friendPercentOff: settings.friendPercentOff,
    creditMinor,
    earnedMinor,
    pendingMinor,
    referrals: rows.map((r) => ({
      id: r.id,
      friendFirstName: firstName(r.referred.user.name),
      status: r.status,
      creditMinor: r.creditMinor,
      currency: r.currency ?? currency,
      createdAt: r.createdAt,
      creditedAt: r.creditedAt,
    })),
  };
}

/** Admin: referrals of a student (Student 360). */
export async function listReferralsForAdmin(studentId: string) {
  const [made, got] = await Promise.all([
    db.referral.findMany({
      where: { referrerId: studentId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, status: true, creditMinor: true, currency: true, createdAt: true, creditedAt: true, referred: { select: { id: true, user: { select: { name: true } } } } },
    }),
    db.referral.findFirst({ where: { referredId: studentId }, select: { id: true, status: true, createdAt: true, referrer: { select: { id: true, user: { select: { name: true } } } } } }),
  ]);
  return { made, referredBy: got };
}

export const referralSettingsSchema = z.object({
  friendPercentOff: z.coerce.number().int().min(0).max(100),
  referrerCreditMinor: z.record(z.string().length(3).toUpperCase(), z.coerce.number().int().min(0).max(10_000_000)),
});

/** Admin: update programme amounts (audit-logged). */
export async function saveReferralSettings(actorId: string, input: z.input<typeof referralSettingsSchema>) {
  const value = referralSettingsSchema.parse(input);
  await setSetting("referral", value);
  await audit({ actorId, action: "settings.update", entity: "Setting", entityId: "referral", after: value });
  return value;
}
