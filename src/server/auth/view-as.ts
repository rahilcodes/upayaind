import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { env } from "@/env";
import { db } from "@/server/db";
import { auth } from "./index";
import { ForbiddenError } from "./access";
import { signViewAs, verifyViewAs, VIEW_AS_COOKIE, VIEW_AS_MINUTES, type ViewAsPayload } from "./view-as.edge";

/**
 * Read-only "view as student" for ADMINs (SPEC P1, D-120). The admin's own
 * session stays intact; a signed 30-minute cookie says which student the /app
 * pages should render. Every mutation is refused while it is active.
 */

export type ViewAsContext = ViewAsPayload & { adminName: string; studentName: string; studentEmail: string; studentTimezone: string; onboarded: boolean };

/** The active view-as context for this request, or null. Cached per request. */
export const getViewAs = cache(async (): Promise<ViewAsContext | null> => {
  let token: string | undefined;
  try {
    token = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!token) return null;
  const p = await verifyViewAs(env.AUTH_SECRET, token);
  if (!p) return null;
  const session = await auth();
  const u = session?.user;
  // Only the admin who started it, with a verified 2FA session, may use the cookie.
  if (!u?.id || u.role !== "ADMIN" || u.mfa !== "ok" || u.id !== p.adminId) return null;
  const student = await db.studentProfile.findUnique({
    where: { id: p.studentId },
    select: { onboardingCompletedAt: true, user: { select: { id: true, name: true, email: true, timezone: true, deletedAt: true } } },
  });
  if (!student || student.user.id !== p.studentUserId || student.user.deletedAt) return null;
  return {
    ...p,
    adminName: u.name,
    studentName: student.user.name,
    studentEmail: student.user.email,
    studentTimezone: student.user.timezone,
    onboarded: Boolean(student.onboardingCompletedAt),
  };
});

/** True when this request is a Next.js server action invocation (POST with the `Next-Action` header). */
export async function isServerActionRequest() {
  try {
    const h = await headers();
    return Boolean(h.get("next-action"));
  } catch {
    return false;
  }
}

/** Refuse any mutation while viewing as a student. Call at the top of every student-side write. */
export async function assertNotViewAs() {
  if (await getViewAs()) throw new ForbiddenError("You're viewing this account read-only. Exit \"View as student\" to make changes.");
}

/** Build the cookie value for an admin → student view (the caller sets the cookie). */
export async function issueViewAsToken(adminId: string, studentId: string, studentUserId: string, now = Date.now()) {
  return signViewAs(env.AUTH_SECRET, { adminId, studentId, studentUserId, exp: now + VIEW_AS_MINUTES * 60_000 });
}

export const VIEW_AS_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: VIEW_AS_MINUTES * 60,
};

export { VIEW_AS_COOKIE, VIEW_AS_MINUTES };
