import "server-only";
import type { AuthTokenType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";

const TTL_MS: Record<AuthTokenType, number> = {
  VERIFY_EMAIL: 24 * 3600e3, // SPEC F1: 24h
  RESET_PASSWORD: 30 * 60e3, // SPEC §10: 30 minutes
  INVITE: 7 * 24 * 3600e3,
};

/** Create a single-use token. Only its SHA-256 hash is stored. Older unused tokens of the same type are revoked. */
export async function issueToken(userId: string, type: AuthTokenType) {
  const raw = randomToken(32);
  await db.$transaction([
    db.authToken.updateMany({ where: { userId, type, consumedAt: null }, data: { consumedAt: new Date() } }),
    db.authToken.create({
      data: { userId, type, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + TTL_MS[type]) },
    }),
  ]);
  return raw;
}

/** Validate and consume a token. Returns the userId, or null if invalid/expired/used. */
export async function consumeToken(raw: string, type: AuthTokenType): Promise<string | null> {
  if (!raw || raw.length > 200) return null;
  const tokenHash = sha256(raw);
  const res = await db.authToken.updateMany({
    where: { tokenHash, type, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (res.count !== 1) return null;
  const t = await db.authToken.findUnique({ where: { tokenHash }, select: { userId: true } });
  return t?.userId ?? null;
}

/** Peek without consuming (to show the reset form only for valid links). */
export async function peekToken(raw: string, type: AuthTokenType) {
  if (!raw || raw.length > 200) return false;
  const t = await db.authToken.findFirst({
    where: { tokenHash: sha256(raw), type, consumedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return Boolean(t);
}
