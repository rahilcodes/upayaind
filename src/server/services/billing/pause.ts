import "server-only";
import { db } from "@/server/db";
import { formatDate } from "@/lib/format";
import { audit } from "../audit";
import { notify } from "../notify";
import { providerFor } from "./provider";
import { BillingError } from "./types";

/**
 * Subscription pause / resume (SPEC F11 "Pause (admin only, P1)", D-121).
 *
 * Pause: status → PAUSED, `pausedAt` = now; targets stop (every target
 * computation treats non-ACTIVE as inactive). Resume: status → ACTIVE,
 * `currentPeriodEnd` moves forward by the paused days (ceil of whole days,
 * at least 1), `pausedDays` accumulates. With Stripe configured the gateway's
 * collection is paused/resumed too (`pause_collection: void`), so no renewal is
 * charged while paused; simulated/manual plans just record the change.
 */

const DAY = 86_400_000;

/** Whole days between pause and resume (ceil, minimum 1). Pure, unit-tested. */
export function pausedDaysBetween(pausedAt: Date, resumedAt: Date): number {
  const ms = resumedAt.getTime() - pausedAt.getTime();
  if (ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / DAY));
}

/** New period end after a pause: old end + paused days. Pure, unit-tested. */
export function extendedPeriodEnd(currentPeriodEnd: Date | null, pausedAt: Date, resumedAt: Date): { end: Date | null; days: number } {
  const days = pausedDaysBetween(pausedAt, resumedAt);
  if (!currentPeriodEnd) return { end: null, days };
  return { end: new Date(currentPeriodEnd.getTime() + days * DAY), days };
}

const SUB_SELECT = {
  id: true,
  status: true,
  provider: true,
  providerSubId: true,
  currentPeriodEnd: true,
  pausedAt: true,
  pausedDays: true,
  planPrice: { select: { plan: { select: { name: true } } } },
  student: {
    select: {
      id: true,
      userId: true,
      user: { select: { name: true, timezone: true } },
      market: { select: { paymentProvider: true } },
      assignments: { where: { isActive: true, type: "PRIMARY" as const }, select: { employee: { select: { userId: true } } } },
    },
  },
} as const;

async function load(subscriptionId: string) {
  const s = await db.subscription.findUnique({ where: { id: subscriptionId }, select: SUB_SELECT });
  if (!s) throw new BillingError("Subscription not found.");
  return s;
}

function gatewayFor(s: { provider: string; providerSubId: string | null; student: { market: { paymentProvider: string | null } } }) {
  if (s.provider === "MANUAL" || !s.providerSubId || s.providerSubId.includes("_sim_")) return null;
  const p = providerFor(s.student.market.paymentProvider ?? s.provider);
  return p.isConfigured() ? p : null;
}

export async function pauseSubscription(actorId: string, subscriptionId: string, reason: string, now = new Date()) {
  const s = await load(subscriptionId);
  if (s.status !== "ACTIVE") throw new BillingError("Only an active subscription can be paused.");
  const gateway = gatewayFor(s);
  if (gateway) await gateway.pauseSubscription(s.providerSubId!);
  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: s.id }, data: { status: "PAUSED", pausedAt: now } });
    await audit({ actorId, action: "subscription.pause", entity: "Subscription", entityId: s.id, before: { status: s.status }, after: { status: "PAUSED", reason, gateway: gateway?.code ?? "none" } }, tx);
  });
  const payload = { plan: s.planPrice.plan.name, studentName: s.student.user.name, studentId: s.student.id, reason };
  await notify(s.student.userId, "subscription_paused", payload).catch(() => undefined);
  for (const a of s.student.assignments) await notify(a.employee.userId, "subscription_paused_employee", payload).catch(() => undefined);
  return { status: "PAUSED" as const };
}

export async function resumeSubscription(actorId: string, subscriptionId: string, now = new Date()) {
  const s = await load(subscriptionId);
  if (s.status !== "PAUSED") throw new BillingError("This subscription isn't paused.");
  const pausedAt = s.pausedAt ?? now;
  const { end, days } = extendedPeriodEnd(s.currentPeriodEnd, pausedAt, now);
  const gateway = gatewayFor(s);
  if (gateway) await gateway.resumeSubscription(s.providerSubId!);
  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: s.id },
      data: { status: "ACTIVE", pausedAt: null, pausedDays: s.pausedDays + days, ...(end ? { currentPeriodEnd: end, remindersSent: [] } : {}) },
    });
    await audit(
      { actorId, action: "subscription.resume", entity: "Subscription", entityId: s.id, before: { status: "PAUSED", currentPeriodEnd: s.currentPeriodEnd, pausedDays: s.pausedDays }, after: { status: "ACTIVE", currentPeriodEnd: end, pausedDays: s.pausedDays + days, days, gateway: gateway?.code ?? "none" } },
      tx,
    );
  });
  const payload = { plan: s.planPrice.plan.name, studentName: s.student.user.name, studentId: s.student.id, days, periodEnd: end ? formatDate(end, s.student.user.timezone) : "—" };
  await notify(s.student.userId, "subscription_resumed", payload).catch(() => undefined);
  for (const a of s.student.assignments) await notify(a.employee.userId, "subscription_resumed_employee", payload).catch(() => undefined);
  return { status: "ACTIVE" as const, days, currentPeriodEnd: end };
}

/** The student's paused subscription (for the /app banners), or null. */
export async function getPausedSubscription(studentId: string) {
  return db.subscription.findFirst({ where: { studentId, status: "PAUSED" }, orderBy: { updatedAt: "desc" }, select: { id: true, pausedAt: true, planPrice: { select: { plan: { select: { name: true } } } } } });
}
