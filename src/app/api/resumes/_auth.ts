import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { isStaff } from "@/server/auth/rbac";
import { ForbiddenError } from "@/server/auth/access";
import { UserError } from "@/server/errors";
import { RateLimitError } from "@/server/services/ratelimit";
import type { Role } from "@/generated/prisma/enums";

/** Session user for route handlers (staff must have passed 2FA). */
export async function routeUser(): Promise<{ id: string; role: Role; timezone: string; name: string } | null> {
  const s = await auth();
  const u = s?.user;
  if (!u?.id) return null;
  if (isStaff(u.role) && u.mfa !== "ok") return null;
  return { id: u.id, role: u.role, timezone: u.timezone, name: u.name };
}

const DOMAIN_ERRORS = new Set(["ResumeError", "ApplicationError", "FileError", "UserError"]);

/** Map service errors to JSON responses (user-safe messages only). */
export function errorResponse(e: unknown) {
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429 });
  if (e instanceof UserError || (e instanceof Error && DOMAIN_ERRORS.has(e.name))) return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  console.error("[api/resumes] unexpected error", e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
