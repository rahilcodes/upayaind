import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";
import { notify } from "@/server/services/notify";
import { formatDate } from "@/lib/format";

/**
 * F11 renewals.
 * - Reminders at T-7 and T-2 days (email + in-app) to the student, and
 *   "student expiring" to the assigned employee when the plan will END
 *   (one-time, manual, or set to cancel) — an auto-renewing plan isn't expiring.
 * - Idempotent: each reminder is keyed `T7:<periodEnd>` / `T2:<periodEnd>` in
 *   Subscription.remindersSent and claimed with an atomic UPDATE before sending,
 *   so overlapping runs never send twice. A new period gets new keys.
 * - Nightly sweep: one-time/manual plans → EXPIRED at period end; Stripe plans
 *   whose renewal never arrived → PAST_DUE after a grace period; long-unpaid
 *   PAST_DUE → EXPIRED. Stripe webhooks remain the primary source of truth.
 */

const DAY = 86_400_000;
export const REMINDER_DAYS = [7, 2] as const;
export const RENEWAL_GRACE_DAYS = 3;
export const PAST_DUE_EXPIRE_DAYS = 21;

type SubRow = {
  id: string;
  provider: string;
  providerSubId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  remindersSent: string[];
  studentId: string;
  planPrice: { interval: string; plan: { name: string } };
  student: { userId: string; user: { name: string; timezone: string } };
};

export function willAutoRenew(s: { provider: string; providerSubId: string | null; cancelAtPeriodEnd: boolean; planPrice: { interval: string } }) {
  return s.provider !== "MANUAL" && Boolean(s.providerSubId) && s.planPrice.interval !== "ONE_TIME" && !s.cancelAtPeriodEnd;
}

/** Which reminder (if any) is due now. Pure, unit-tested. */
export function dueReminder(periodEnd: Date, sent: string[], now: Date): { key: string; days: number } | null {
  const msLeft = periodEnd.getTime() - now.getTime();
  if (msLeft <= 0) return null;
  const days = Math.ceil(msLeft / DAY);
  const stamp = periodEnd.toISOString().slice(0, 10);
  // Most urgent first: if T-7 was missed (e.g. a 3-day-old signup), only T-2 goes out.
  for (const d of [...REMINDER_DAYS].sort((a, b) => a - b)) {
    if (days <= d) {
      const key = `T${d}:${stamp}`;
      return sent.includes(key) ? null : { key, days };
    }
  }
  return null;
}

async function claimReminder(subId: string, key: string) {
  const n = await db.$executeRaw`UPDATE "Subscription" SET "remindersSent" = array_append("remindersSent", ${key}) WHERE "id" = ${subId} AND NOT (${key} = ANY("remindersSent"))`;
  return n === 1;
}

export async function runRenewalReminders(now = new Date()) {
  const subs: SubRow[] = await db.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + Math.max(...REMINDER_DAYS) * DAY) } },
    select: {
      id: true,
      provider: true,
      providerSubId: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: true,
      remindersSent: true,
      studentId: true,
      planPrice: { select: { interval: true, plan: { select: { name: true } } } },
      student: { select: { userId: true, user: { select: { name: true, timezone: true } } } },
    },
  });

  let sent = 0;
  for (const s of subs) {
    const due = dueReminder(s.currentPeriodEnd!, s.remindersSent, now);
    if (!due) continue;
    if (!(await claimReminder(s.id, due.key))) continue;
    sent++;
    const autoRenew = willAutoRenew(s);
    try {
      await notify(s.student.userId, "renewal_reminder", {
        days: due.days,
        plan: s.planPrice.plan.name,
        date: formatDate(s.currentPeriodEnd!, s.student.user.timezone),
        autoRenew: autoRenew ? 1 : 0,
      });
      if (!autoRenew) {
        const a = await db.assignment.findFirst({
          where: { studentId: s.studentId, isActive: true, type: "PRIMARY" },
          select: { employee: { select: { userId: true, user: { select: { timezone: true } } } } },
        });
        if (a) {
          await notify(a.employee.userId, "student_expiring", {
            studentName: s.student.user.name,
            studentId: s.studentId,
            days: due.days,
            date: formatDate(s.currentPeriodEnd!, a.employee.user.timezone),
          });
        }
      }
    } catch (e) {
      console.error("[billing] renewal reminder failed", s.id, e);
    }
  }
  return { checked: subs.length, sent };
}

export async function runSubscriptionStatusSweep(now = new Date()) {
  const changes: { id: string; from: string; to: string }[] = [];

  // 1) Plans without auto-renew end at period end → EXPIRED.
  //    (Stripe plans set to cancel get customer.subscription.deleted → CANCELED;
  //    this is the safety net after the grace period.)
  const ended = await db.subscription.findMany({
    where: { status: "ACTIVE", currentPeriodEnd: { lte: now } },
    select: { id: true, provider: true, providerSubId: true, cancelAtPeriodEnd: true, currentPeriodEnd: true, planPrice: { select: { interval: true } } },
  });
  for (const s of ended) {
    const graceOver = s.currentPeriodEnd!.getTime() + RENEWAL_GRACE_DAYS * DAY <= now.getTime();
    let to: "EXPIRED" | "CANCELED" | "PAST_DUE" | null = null;
    if (s.planPrice.interval === "ONE_TIME" || s.provider === "MANUAL" || !s.providerSubId) to = "EXPIRED";
    else if (graceOver) to = s.cancelAtPeriodEnd ? "CANCELED" : "PAST_DUE";
    if (!to) continue;
    const n = await db.subscription.updateMany({ where: { id: s.id, status: "ACTIVE" }, data: { status: to, ...(to !== "PAST_DUE" ? { cancelAtPeriodEnd: false } : {}) } });
    if (n.count) changes.push({ id: s.id, from: "ACTIVE", to });
  }

  // 2) Long-unpaid PAST_DUE → EXPIRED.
  const stale = await db.subscription.findMany({
    where: { status: "PAST_DUE", currentPeriodEnd: { lte: new Date(now.getTime() - PAST_DUE_EXPIRE_DAYS * DAY) } },
    select: { id: true },
  });
  for (const s of stale) {
    const n = await db.subscription.updateMany({ where: { id: s.id, status: "PAST_DUE" }, data: { status: "EXPIRED" } });
    if (n.count) changes.push({ id: s.id, from: "PAST_DUE", to: "EXPIRED" });
  }

  for (const c of changes) {
    await audit({ action: "subscription.sweep", entity: "Subscription", entityId: c.id, before: { status: c.from }, after: { status: c.to } });
  }
  return { changed: changes.length, changes };
}
