import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";

export type AuditInput = {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

const SECRET_KEYS = /(password|secret|token|Enc)$/i;

/** Strip secret-looking fields before they land in the audit log. */
function scrub(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (k, v) => (k && SECRET_KEYS.test(k) ? "[redacted]" : v)),
  ) as Prisma.InputJsonValue;
}

/** Append-only audit trail (SPEC §10). Pass a transaction client to write atomically. */
export async function audit(input: AuditInput, tx: Tx | typeof db = db) {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      before: scrub(input.before),
      after: scrub(input.after),
      ip: input.ip ?? null,
    },
  });
}
