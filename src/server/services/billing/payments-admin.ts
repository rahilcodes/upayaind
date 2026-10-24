import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { PaymentStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { audit } from "@/server/services/audit";
import { invoiceFileIds } from "./invoices";
import { providerFor } from "./provider";
import { BillingError } from "./types";

export const PAGE_SIZE = 25;

export const paymentFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(PaymentStatus).optional().catch(undefined),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional().catch(undefined),
  market: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  cursor: z.string().max(64).optional(),
});
export type PaymentFilter = z.infer<typeof paymentFilterSchema>;

/** Filterable, cursor-paginated payments list (25/page). Totals are per currency — never summed across. */
export async function listPayments(raw: Record<string, string | undefined>) {
  const f = paymentFilterSchema.parse(raw);
  const where: Prisma.PaymentWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.currency ? { currency: f.currency } : {}),
    ...(f.market ? { student: { market: { code: f.market } } } : {}),
    ...(f.from || f.to
      ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000) } : {}) } }
      : {}),
    ...(f.q
      ? {
          OR: [
            { invoiceNumber: { contains: f.q, mode: "insensitive" } },
            { providerPaymentId: { contains: f.q } },
            { student: { user: { email: { contains: f.q, mode: "insensitive" } } } },
            { student: { user: { name: { contains: f.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const rows = await db.payment.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      invoiceNumber: true,
      invoiceKey: true,
      amountMinor: true,
      currency: true,
      taxMinor: true,
      refundedMinor: true,
      status: true,
      provider: true,
      providerPaymentId: true,
      failureReason: true,
      method: true,
      reference: true,
      paidAt: true,
      createdAt: true,
      studentId: true,
      student: { select: { user: { select: { name: true, email: true } }, market: { select: { code: true, locale: true } } } },
      subscription: { select: { planPrice: { select: { interval: true, plan: { select: { name: true } } } } } },
    },
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const files = await invoiceFileIds(page.map((p) => p.invoiceKey));

  const totals = await db.payment.groupBy({
    by: ["currency"],
    where: { ...where, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } },
    _sum: { amountMinor: true, refundedMinor: true },
    _count: { _all: true },
  });
  const [currencies, markets] = await Promise.all([
    db.payment.findMany({ distinct: ["currency"], select: { currency: true } }),
    db.market.findMany({ select: { code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return {
    filter: f,
    items: page.map((p) => ({
      ...p,
      fileId: p.invoiceKey ? (files.get(p.invoiceKey) ?? null) : null,
      refundableMinor: p.amountMinor - p.refundedMinor,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
    totals: totals.map((t) => ({ currency: t.currency, count: t._count._all, grossMinor: t._sum.amountMinor ?? 0, refundedMinor: t._sum.refundedMinor ?? 0 })),
    currencies: currencies.map((c) => c.currency).sort(),
    markets,
  };
}

export const refundInputSchema = z.object({
  paymentId: z.string().min(1),
  amountMinor: z.coerce.number().int().positive("Enter an amount above zero"),
  reason: z.string().trim().min(3, "Give a short reason (for the audit log)").max(300),
});

/** Full or partial refund via the provider API; audit-logged. Payments are never deleted. */
export async function refundPayment(actor: { id: string }, raw: z.input<typeof refundInputSchema>, meta: { ip?: string | null } = {}) {
  const v = refundInputSchema.parse(raw);
  const p = await db.payment.findUnique({
    where: { id: v.paymentId },
    select: { id: true, status: true, amountMinor: true, refundedMinor: true, currency: true, provider: true, providerPaymentId: true, invoiceNumber: true },
  });
  if (!p) throw new BillingError("Payment not found.");
  if (p.status !== "SUCCEEDED" && p.status !== "PARTIALLY_REFUNDED") throw new BillingError("Only successful payments can be refunded.");
  const remaining = p.amountMinor - p.refundedMinor;
  if (v.amountMinor > remaining) throw new BillingError("The refund is larger than the amount left to refund.", "amountMinor");

  let refundId: string;
  if (p.provider === "MANUAL") {
    refundId = `manual_${Date.now()}`;
  } else {
    if (!p.providerPaymentId || p.providerPaymentId.includes("_sim_")) {
      throw new BillingError("This payment wasn’t taken through a live payment provider, so it can’t be refunded automatically.");
    }
    const provider = providerFor(p.provider);
    if (!provider.isConfigured()) throw new BillingError("The payment provider isn’t configured, so refunds can’t be issued right now.");
    ({ refundId } = await provider.refund({
      providerPaymentId: p.providerPaymentId,
      amountMinor: v.amountMinor,
      reason: v.reason,
      idempotencyKey: `refund_${p.id}_${p.refundedMinor}_${v.amountMinor}`,
    }));
  }

  const refunded = p.refundedMinor + v.amountMinor;
  const status = refunded >= p.amountMinor ? ("REFUNDED" as const) : ("PARTIALLY_REFUNDED" as const);
  await db.$transaction(async (tx) => {
    // Optimistic guard against two admins refunding at the same time.
    const n = await tx.payment.updateMany({ where: { id: p.id, refundedMinor: p.refundedMinor }, data: { refundedMinor: refunded, status } });
    if (n.count === 0) throw new BillingError("This payment changed while you were refunding it. Reload and check before trying again.");
    await audit(
      {
        actorId: actor.id,
        action: "payment.refund",
        entity: "Payment",
        entityId: p.id,
        before: { status: p.status, refundedMinor: p.refundedMinor },
        after: { status, refundedMinor: refunded, amountMinor: v.amountMinor, currency: p.currency, reason: v.reason, refundId, invoiceNumber: p.invoiceNumber },
        ip: meta.ip ?? null,
      },
      tx,
    );
  });
  return { status, refundedMinor: refunded, refundId };
}
