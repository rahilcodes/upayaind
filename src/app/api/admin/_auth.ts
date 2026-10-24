import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { can, DEFAULT_TEAM_LEAD_SECTIONS, sectionForAction, type Action } from "@/server/auth/rbac";
import type { Role } from "@/generated/prisma/enums";

export type AdminRouteUser = { id: string; role: Role; timezone: string; name: string };

/** Admin route handlers: signed in, 2FA passed, and allowed to perform `action`. */
export async function adminRouteUser(action: Action): Promise<AdminRouteUser | NextResponse> {
  const s = await auth();
  const u = s?.user;
  if (!u?.id || u.mfa !== "ok") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(u.role, action)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Team leads only reach sections an admin enabled (D-149); API routes bypass the middleware, so check here too.
  if (u.role === "TEAM_LEAD") {
    const section = sectionForAction(action);
    if (section && !(u.sections ?? DEFAULT_TEAM_LEAD_SECTIONS).includes(section)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return { id: u.id, role: u.role, timezone: u.timezone, name: u.name };
}

export function paramsOf(req: Request) {
  const sp = new URL(req.url).searchParams;
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of sp.entries()) out[k] = v;
  return out;
}

export function formatOf(req: Request): "csv" | "xlsx" {
  return new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
}

export const stamp = () => new Date().toISOString().slice(0, 10);
