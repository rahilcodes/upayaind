/**
 * Client analytics helper (SPEC §6.1). Fires a GA4 event only when the
 * visitor accepted analytics cookies (gtag is never loaded otherwise).
 *
 * Server-rendered links opt in with `data-track="<event>"` (+ optional
 * `data-track-props='{"plan":"…"}'`); one delegated listener in <Analytics/>
 * handles them, so CTAs don't need to be client components.
 */
export type TrackEvent = "cta_book_call" | "cta_get_started" | "pricing_view" | "plan_selected" | "checkout_started" | "contact_submitted";

type Gtag = (cmd: "event", name: string, props?: Record<string, unknown>) => void;

export function track(event: TrackEvent, props: Record<string, string | number | boolean | null | undefined> = {}) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return;
  try {
    gtag("event", event, props);
  } catch {
    // never break the page for analytics
  }
}

/** Props for a server-rendered element that should fire `event` when clicked. */
export function trackAttrs(event: TrackEvent, props?: Record<string, string | number>) {
  return { "data-track": event, ...(props ? { "data-track-props": JSON.stringify(props) } : {}) } as Record<string, string>;
}
