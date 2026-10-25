/**
 * Grant manual (offline-paid) plans to existing students in bulk.
 *
 *   pnpm tsx --conditions=react-server scripts/grant-plans.ts grants.json [--actor admin@email]
 *
 * grants.json: [{ "email": "x@y.com", "plan": "in_premium", "startsAt": "2027-01-01", "status": "PENDING_PAYMENT", "note": "Paid by UPI" }]
 * `plan` is a Plan code; the price is the student's market price for it (QUARTERLY for India).
 * Writes the same rows Admin → Student → Billing → "Grant plan" writes (MANUAL subscription,
 * audit log entry) and puts ACTIVE students in the assignment queue (Admin → Assignments
 * "Assign now", or the auto-assign job). Deliberately touches only the database so it runs
 * on a server without the web runtime. A future start is best granted with
 * "status": "PENDING_PAYMENT" and activated from the admin panel when it begins.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "../src/server/db";
import { periodEndFor } from "../src/lib/billing-period";

type Grant = { email: string; plan: string; startsAt?: string; note?: string; status?: "ACTIVE" | "PENDING_PAYMENT" };

async function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) throw new Error("Usage: grant-plans.ts <grants.json> [--actor email]");
  const i = rest.indexOf("--actor");
  const actorEmail = i >= 0 ? rest[i + 1] : null;
  const actor = actorEmail
    ? await db.user.findUniqueOrThrow({ where: { email: actorEmail }, select: { id: true } })
    : await db.user.findFirstOrThrow({ where: { role: "ADMIN", deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });

  const grants = JSON.parse(readFileSync(file, "utf8")) as Grant[];
  for (const g of grants) {
    const user = await db.user.findFirst({ where: { email: { equals: g.email, mode: "insensitive" } }, select: { student: { select: { id: true, marketId: true } } } });
    if (!user?.student) {
      console.log(`• ${g.email}: no student account — skipped`);
      continue;
    }
    const student = user.student;
    const live = await db.subscription.findFirst({ where: { studentId: student.id, status: { in: ["ACTIVE", "PAUSED", "PENDING_PAYMENT", "PAST_DUE"] } }, select: { status: true } });
    if (live) {
      console.log(`• ${g.email}: already has a ${live.status} plan — skipped`);
      continue;
    }
    const price = await db.planPrice.findFirst({
      where: { marketId: student.marketId, isActive: true, plan: { code: g.plan, isActive: true, deletedAt: null } },
      orderBy: { amountMinor: "asc" },
      select: { id: true, interval: true, amountMinor: true, currency: true, plan: { select: { name: true } } },
    });
    if (!price) {
      console.log(`• ${g.email}: no active price for plan "${g.plan}" in the student's market — skipped`);
      continue;
    }
    const status = g.status ?? "ACTIVE";
    const startsAt = g.startsAt ? new Date(`${g.startsAt}T00:00:00+05:30`) : new Date();
    const periodEnd = periodEndFor(startsAt, price.interval);
    const note = g.note ?? "Granted by scripts/grant-plans.ts";
    await db.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: { studentId: student.id, planPriceId: price.id, status, provider: "MANUAL", currentPeriodStart: startsAt, currentPeriodEnd: periodEnd, remindersSent: [] },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "subscription.grant", entity: "Subscription", entityId: sub.id, after: { studentId: student.id, planPriceId: price.id, plan: price.plan.name, interval: price.interval, status, currentPeriodStart: startsAt, currentPeriodEnd: periodEnd, note, source: "scripts/grant-plans.ts" } },
      });
      if (status === "ACTIVE") {
        await tx.auditLog.create({ data: { actorId: actor.id, action: "subscription.activate", entity: "Subscription", entityId: sub.id, before: { status: "PENDING_PAYMENT" }, after: { status: "ACTIVE", periodEnd } } });
        // Same effect as the "subscription.activated" job when nobody has capacity: the student waits in the Assignments queue.
        await tx.studentProfile.update({ where: { id: student.id }, data: { assignmentQueue: "AWAITING", awaitingSince: new Date() } });
      }
    });
    console.log(`✓ ${g.email}: ${status} ${price.plan.name} ${price.interval} ${price.currency} ${price.amountMinor / 100} · ${startsAt.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
