import "server-only";
import { auth } from "@/server/auth";
import { getViewAs } from "@/server/auth/view-as";

/** Signed-in, onboarded-or-not student for /api/student/* route handlers. */
export async function routeStudent() {
  const s = await auth();
  const u = s?.user;
  const v = u?.role === "ADMIN" ? await getViewAs() : null; // read-only "view as student" (D-120)
  if (v) return { id: v.studentUserId, role: "STUDENT" as const, timezone: v.studentTimezone, name: v.studentName };
  if (!u?.id || u.role !== "STUDENT") return null;
  return { id: u.id, role: u.role, timezone: u.timezone, name: u.name };
}

export function attachmentName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
}
