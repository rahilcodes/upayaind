import * as Sentry from "@sentry/nextjs";
import { SentryUser } from "./sentry-user";

/**
 * Server half: tags the current request's Sentry scope with the user id + role
 * (never PII) and mounts the client half for browser events.
 */
export function PortalObservability({ user }: { user: { id: string; role: string } }) {
  Sentry.setUser({ id: user.id });
  Sentry.setTag("role", user.role);
  return <SentryUser id={user.id} role={user.role} />;
}
