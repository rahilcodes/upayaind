import "server-only";
import { auth } from "@/server/auth";

/** Signed-in, onboarded-or-not student for /api/student/* route handlers. */
export async function routeStudent() {
  const s = await auth();
  const u = s?.user;
  if (!u?.id || u.role !== "STUDENT") return null;
  return { id: u.id, role: u.role, timezone: u.timezone, name: u.name };
}

export function attachmentName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
}
