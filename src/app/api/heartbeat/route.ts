import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { isStaff } from "@/server/auth/rbac";
import { recordHeartbeat } from "@/server/services/attendance";

export const dynamic = "force-dynamic";

/**
 * Activity ping (SPEC F8): the /work client sends one every 60 s while the tab
 * is visible and the user interacted in the last 5 minutes. Upserts one
 * ActivityMinute per user per minute (idempotent, so retries are harmless).
 */
export async function POST() {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !isStaff(u.role) || u.mfa !== "ok") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { minute } = await recordHeartbeat(u.id);
  return NextResponse.json({ ok: true, minute }, { headers: { "Cache-Control": "no-store" } });
}
