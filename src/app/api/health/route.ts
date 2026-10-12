import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { integrations } from "@/env";

export const dynamic = "force-dynamic";

/** Liveness + DB check (M0 acceptance: `/api/health` returns OK). */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok", latencyMs: Date.now() - started, integrations, at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
