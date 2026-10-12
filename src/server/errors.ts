import "server-only";
import { z } from "zod";
import { ForbiddenError } from "@/server/auth/access";
import { RateLimitError } from "@/server/services/ratelimit";

/** An error whose message is safe to show to the user (validation, business rules). */
export class UserError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * Wrap a server action body: returns `{ok:true,data}` or a user-safe error.
 * Unknown errors are logged and replaced with a generic message (no leaks).
 */
export async function safeAction<T>(fn: () => Promise<T>, okMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: okMessage };
  } catch (e) {
    // Let Next.js redirects / notFound propagate.
    if (e && typeof e === "object" && "digest" in e && typeof (e as { digest?: unknown }).digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_")) throw e;
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Please check the form.", fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]> };
    if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.field ? { [e.field]: [e.message] } : undefined };
    if (e instanceof ForbiddenError || e instanceof RateLimitError) return { ok: false, error: e.message };
    if (e instanceof Error && ["AccountError", "AssignmentError", "FileError", "BillingError", "ResumeError", "LeaveError", "AttendanceError", "VaultError", "ApplicationError", "MessagingError", "CmsError"].includes(e.name)) {
      const field = (e as { field?: string }).field;
      return { ok: false, error: e.message, fieldErrors: field ? { [field]: [e.message] } : undefined };
    }
    console.error("[action] unexpected error", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
