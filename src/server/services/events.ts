import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { log } from "@/server/log";

/** Server-side product metrics (SPEC §4 analytics: "server-side event table"). Never throws. */
export async function trackEvent(name: string, userId?: string | null, props?: Record<string, unknown>) {
  try {
    await db.productEvent.create({
      data: { name, userId: userId ?? null, props: (props ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  } catch (e) {
    log.error("events.track_failed", { name, err: e });
  }
}
