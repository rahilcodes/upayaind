"use client";
import * as React from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Attaches { id, role } — never name, email or phone — to browser-side Sentry
 * events for the signed-in portal user (DECISIONS D-130). No-op without a DSN.
 */
export function SentryUser({ id, role }: { id: string; role: string }) {
  React.useEffect(() => {
    Sentry.setUser({ id });
    Sentry.setTag("role", role);
    return () => Sentry.setUser(null);
  }, [id, role]);
  return null;
}
