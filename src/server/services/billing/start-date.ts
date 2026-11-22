import "server-only";
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/format";
import { addDays } from "@/lib/service-start";
import { ForbiddenError } from "@/server/auth/access";
import { can } from "@/server/auth/rbac";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";
import { notify } from "@/server/services/notify";
import { gatewayAutoRenews, providerFor } from "./provider";
import { BillingError } from "./types";

/**
 * Admin: change the start date of an applicant's plan (D-171). Billing follows the date:
 *
 * - Free trial (Stripe): the trial keeps its length, so the first charge moves to
 *   new start + trial days.
 * - Paid Stripe subscription: the next charge moves by the same number of days.
 * - Razorpay / manual / one-time plans: the paid period moves with the start date
 *   (same length, new start and end).
 *
 * The student and their specialist are told; the change is audited. Daily targets
 * count from the start date (see targets.ts).
 */

export const setStartDateSchema = z.object({
  subscriptionId: z.string().min(1).max(64),
  startsAt: z.coerce.date(),
  note: z.string().trim().max(500).optional(),
});

const DAY = 86_400_000;
/** Stripe needs a future billing date; keep a small margin for clock drift. */
const MIN_LEAD_MS = 60 * 60_000;

export type StartDateActor = { id: string; role: Role };

export async function setServiceStartDate(actor: StartDateActor, raw: z.input<typeof setStartDateSchema>, now = new Date()) {
  if (!can(actor.role, "billing.manage")) throw new ForbiddenError("Only an admin can change a plan’s start date.");
  const v = setStartDateSchema.parse(raw);
  const s = await db.subscription.findUnique({
    where: { id: v.subscriptionId },
    select: {
      id: true,
      status: true,
      provider: true,
      providerSubId: true,
      studentId: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      serviceStartAt: true,
      trialEndsAt: true,
      planPrice: { select: { interval: true, plan: { select: { name: true } } } },
      student: {
        select: {
          userId: true,
          user: { select: { name: true, timezone: true } },
          market: { select: { trialDays: true } },
          assignments: { where: { isActive: true, type: "PRIMARY" as const }, select: { employee: { select: { userId: true, user: { select: { timezone: true } } } } } },
        },
      },
    },
  });
  if (!s) throw new BillingError("Subscription not found.");
  if (s.status !== "ACTIVE") throw new BillingError("Only an active plan’s start date can be changed.");
  const oldStart = s.serviceStartAt ?? s.currentPeriodStart;
  if (!oldStart || !s.currentPeriodEnd) throw new BillingError("This plan has no period yet. Record its first payment before changing the start date.");
  if (Math.abs(v.startsAt.getTime() - now.getTime()) > 120 * DAY) throw new BillingError("Choose a start date within 120 days of today.", "startsAt");
  const delta = v.startsAt.getTime() - oldStart.getTime();
  if (delta === 0) throw new BillingError("The plan already starts on this date.", "startsAt");

  const trialing = Boolean(s.trialEndsAt && s.trialEndsAt > now);
  const onGateway = gatewayAutoRenews(s.provider) && s.planPrice.interval !== "ONE_TIME" && Boolean(s.providerSubId);

  let data: { serviceStartAt: Date; currentPeriodStart?: Date; currentPeriodEnd: Date; trialEndsAt?: Date; remindersSent: string[] };
  if (trialing) {
    // Keep the trial length: first charge = new start + the days of trial that were given.
    const trialMs = Math.max(DAY, s.trialEndsAt!.getTime() - oldStart.getTime());
    const trialEnd = new Date(v.startsAt.getTime() + trialMs);
    data = { serviceStartAt: v.startsAt, currentPeriodEnd: trialEnd, trialEndsAt: trialEnd, remindersSent: [] };
  } else if (onGateway) {
    data = { serviceStartAt: v.startsAt, currentPeriodEnd: new Date(s.currentPeriodEnd.getTime() + delta), remindersSent: [] };
  } else {
    data = { serviceStartAt: v.startsAt, currentPeriodStart: v.startsAt, currentPeriodEnd: new Date(s.currentPeriodEnd.getTime() + delta), remindersSent: [] };
  }

  if (onGateway) {
    if (data.currentPeriodEnd.getTime() < now.getTime() + MIN_LEAD_MS) {
      throw new BillingError("With this start date the next charge would already be due. Choose a later date.", "startsAt");
    }
    const simulated = s.providerSubId!.includes("_sim_");
    const gateway = providerFor(s.provider);
    if (!simulated) {
      if (!gateway.isConfigured()) throw new BillingError("The payment gateway isn’t configured, so the billing date can’t be moved.");
      await gateway.setBillingDate(s.providerSubId!, data.currentPeriodEnd);
    }
  }

  await db.$transaction(async (tx) => {
    await tx.subscription.update({ where: { id: s.id }, data });
    await audit(
      {
        actorId: actor.id,
        action: "subscription.set_start_date",
        entity: "Subscription",
        entityId: s.id,
        before: { serviceStartAt: oldStart, currentPeriodEnd: s.currentPeriodEnd, trialEndsAt: s.trialEndsAt },
        after: { serviceStartAt: v.startsAt, currentPeriodEnd: data.currentPeriodEnd, trialEndsAt: data.trialEndsAt ?? null, note: v.note ?? null },
      },
      tx,
    );
  });

  const tz = s.student.user.timezone;
  await notify(s.student.userId, "start_date_changed", {
    plan: s.planPrice.plan.name,
    start: formatDate(v.startsAt, tz),
    periodEnd: formatDate(data.currentPeriodEnd, tz),
    trialEnd: data.trialEndsAt ? formatDate(data.trialEndsAt, tz) : null,
  }).catch((e) => console.error("[billing] start date email failed", s.id, e));
  for (const a of s.student.assignments) {
    await notify(a.employee.userId, "start_date_changed_employee", { studentName: s.student.user.name, studentId: s.studentId, start: formatDate(v.startsAt, a.employee.user.timezone) }).catch(() => undefined);
  }
  return { subscriptionId: s.id, serviceStartAt: v.startsAt, currentPeriodEnd: data.currentPeriodEnd, trialEndsAt: data.trialEndsAt ?? null };
}

/** Trial end for a given start (used by previews). */
export function trialEndFor(start: Date, days: number) {
  return addDays(start, days);
}
