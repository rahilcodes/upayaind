import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

/** Edge runtime (middleware) Sentry (DECISIONS D-130). No DSN → disabled. */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProd = process.env.NODE_ENV === "production";

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // No PII: user info/cookies/bodies are never collected; beforeSend scrubs the rest.
  dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
  tracesSampleRate: isProd ? 0.1 : 0,
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
});
