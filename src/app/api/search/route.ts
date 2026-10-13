import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { isStaff } from "@/server/auth/rbac";
import { rateLimit } from "@/server/services/ratelimit";
import { searchAll, SEARCH_MIN_CHARS } from "@/server/services/search";

export const dynamic = "force-dynamic";

/** ⌘K palette search (D-125): staff only, role-aware, rate-limited, ≥ 2 chars, ≤ 8 per group. */
export async function GET(req: Request) {
  const s = await auth();
  const u = s?.user;
  if (!u?.id || !isStaff(u.role) || u.mfa !== "ok") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < SEARCH_MIN_CHARS) return NextResponse.json({ students: [], employees: [], applications: [] }, { headers: { "Cache-Control": "no-store" } });
  const rl = await rateLimit("search", u.id);
  if (!rl.success) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } });
  const results = await searchAll({ id: u.id, role: u.role }, q);
  return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
}
