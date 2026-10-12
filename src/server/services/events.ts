import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

/** Server-side product metrics (SPEC §4 analytics: "server-side event table"). Never throws. */
export async function trackEvent(name: string, userId?: string | null, props?: Record<string, unknown>) {
  try {
    await db.productEvent.create({
      data: { name, userId: userId ?? null, props: (props ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  } catch (e) {
    console.error("trackEvent failed", name, e);
  }
}
