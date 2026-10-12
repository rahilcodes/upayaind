import "server-only";
import { NextResponse } from "next/server";
import { ForbiddenError } from "@/server/auth/access";
import { RateLimitError } from "@/server/services/ratelimit";
import type { ThreadView } from "@/server/services/messaging";

const USER_ERRORS = new Set(["MessagingError", "FileError", "UserError"]);

export function messagingError(e: unknown) {
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429 });
  if (e instanceof Error && USER_ERRORS.has(e.name)) return NextResponse.json({ error: e.message, field: (e as { field?: string }).field }, { status: 400 });
  console.error("[api/messages] unexpected error", e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

/** JSON shape sent to the client (dates as ISO strings). */
export function serializeThread(t: ThreadView) {
  return {
    ...t,
    messages: t.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), readAt: m.readAt?.toISOString() ?? null })),
  };
}
export type ThreadJson = ReturnType<typeof serializeThread>;
