import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/env";

export { Prisma } from "@/generated/prisma/client";

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: env.NODE_ENV === "production" ? 10 : 5 });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

/** Single Prisma client per process (reused across hot reloads in dev). */
export const db = globalForPrisma.prisma ?? createClient();
if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type DB = typeof db;
/** A Prisma interactive-transaction client. */
export type Tx = Parameters<Parameters<DB["$transaction"]>[0]>[0];
