/**
 * Grant manual (offline-paid) plans to existing students in bulk.
 *
 *   pnpm tsx --conditions=react-server scripts/grant-plans.ts grants.json [--actor admin@email]
 *
 * grants.json: [{ "email": "x@y.com", "plan": "in_premium", "startsAt": "2027-01-01", "note": "Paid by UPI" }]
 * `plan` is a Plan code; the price is the student's market price for it (QUARTERLY for India).
 * Uses the same service as Admin → Student → Billing → "Grant plan", so invariants
 * (one live plan, auto-assignment on activation, audit log) all apply. A plan with
 * future start is best granted with "status": "PENDING_PAYMENT" and activated from the
 * admin panel when it begins (so no specialist is assigned early).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "../src/server/db";
import { grantPlan } from "../src/server/services/billing/manual";

type Grant = { email: string; plan: string; startsAt?: string; note?: string; status?: "ACTIVE" | "PENDING_PAYMENT" };

async function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) throw new Error("Usage: grant-plans.ts <grants.json> [--actor email]");
  const i = rest.indexOf("--actor");
  const actorEmail = i >= 0 ? rest[i + 1] : null;
  const actor = actorEmail
    ? await db.user.findUniqueOrThrow({ where: { email: actorEmail }, select: { id: true, role: true } })
    : await db.user.findFirstOrThrow({ where: { role: "ADMIN", deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, role: true } });

  const grants = JSON.parse(readFileSync(file, "utf8")) as Grant[];
  for (const g of grants) {
    const user = await db.user.findFirst({ where: { email: { equals: g.email, mode: "insensitive" } }, select: { student: { select: { id: true, marketId: true } } } });
    if (!user?.student) {
      console.log(`• ${g.email}: no student account — skipped`);
      continue;
    }
    const live = await db.subscription.findFirst({ where: { studentId: user.student.id, status: { in: ["ACTIVE", "PAUSED", "PENDING_PAYMENT"] } }, select: { id: true, status: true } });
    if (live) {
      console.log(`• ${g.email}: already has a ${live.status} plan — skipped`);
      continue;
    }
    const price = await db.planPrice.findFirst({ where: { marketId: user.student.marketId, isActive: true, plan: { code: g.plan, isActive: true, deletedAt: null } }, orderBy: { amountMinor: "asc" }, select: { id: true, interval: true, amountMinor: true, currency: true } });
    if (!price) {
      console.log(`• ${g.email}: no active price for plan "${g.plan}" in the student's market — skipped`);
      continue;
    }
    const startsAt = g.startsAt ? new Date(`${g.startsAt}T00:00:00+05:30`) : undefined;
    const r = await grantPlan(actor, { studentId: user.student.id, planPriceId: price.id, startsAt, status: g.status ?? "ACTIVE", note: g.note ?? "Granted by scripts/grant-plans.ts" });
    console.log(`✓ ${g.email}: ${r.status} ${g.plan} ${price.interval} ${price.currency} ${price.amountMinor / 100} · ${r.currentPeriodStart.toISOString().slice(0, 10)} → ${r.currentPeriodEnd.toISOString().slice(0, 10)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
