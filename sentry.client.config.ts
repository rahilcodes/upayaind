import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

/**
 * Browser-side Sentry (DECISIONS D-130). No DSN → `enabled: false`, which makes
 * every Sentry call a no-op. PII is never sent: `sendDefaultPii` is off and
 * `beforeSend` scrubs secrets + reduces `user` to { id, role }.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProd = process.env.NODE_ENV === "production";

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // No PII: user info/cookies/bodies are never collected; beforeSend scrubs the rest.
  dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
  tracesSampleRate: isProd ? 0.1 : 0,
  tunnel: dsn ? "/monitoring" : undefined,
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
  beforeBreadcrumb: (crumb) => {
    // Never record form input or fetch bodies.
    if (crumb.category === "ui.input") return null;
    return crumb;
  },
  ignoreErrors: ["ResizeObserver loop", "NEXT_REDIRECT", "NEXT_NOT_FOUND", /Loading chunk \d+ failed/],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
