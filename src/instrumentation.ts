import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook: loads the runtime-specific Sentry config and
 * forwards server-side render/route errors (DECISIONS D-130). Everything here
 * is a no-op when no DSN is configured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
