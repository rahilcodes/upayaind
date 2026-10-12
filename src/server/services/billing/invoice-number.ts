import "server-only";
import { db, type Tx } from "@/server/db";

export const INVOICE_PREFIX = "UPY";

export function formatInvoiceNumber(year: number, seq: number) {
  return `${INVOICE_PREFIX}-${year}-${String(seq).padStart(6, "0")}`;
}

/**
 * Next invoice number `UPY-<year>-<6 digits>` from a per-year Counter row.
 * The increment is a single atomic UPDATE … RETURNING (row-locked by Postgres),
 * so concurrent payments never share a number. Call it inside the same
 * transaction that writes the Payment so a rollback doesn't burn a number.
 * The first number of a year continues after any imported/seeded invoices.
 */
export async function nextInvoiceNumber(tx: Tx | typeof db, at = new Date()): Promise<string> {
  const year = at.getUTCFullYear();
  const key = `invoice:${year}`;
  const updated = await tx.$queryRaw<{ value: number }[]>`UPDATE "Counter" SET "value" = "value" + 1 WHERE "key" = ${key} RETURNING "value"`;
  if (updated[0]) return formatInvoiceNumber(year, Number(updated[0].value));

  const like = `${INVOICE_PREFIX}-${year}-%`;
  const inserted = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value")
    VALUES (
      ${key},
      COALESCE((SELECT MAX(CAST(SUBSTRING("invoiceNumber" FROM '([0-9]+)$') AS INTEGER)) FROM "Payment" WHERE "invoiceNumber" LIKE ${like}), 0) + 1
    )
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return formatInvoiceNumber(year, Number(inserted[0]!.value));
}
