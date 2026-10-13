import "server-only";
import { z } from "zod";
import { absoluteUrl } from "@/lib/utils";
import { getSetting } from "./settings";

/**
 * Outgoing webhook alerts to Slack / Teams / Discord-compatible endpoints
 * (D-122). Admins configure one or more URLs with per-event checkboxes in
 * Settings. `sendAlert()` is fire-and-forget: it never throws, times out
 * after 5 s and logs failures, so a dead webhook can't slow down a lead form
 * or a payment webhook.
 *
 * Payload: Slack-style `{ text, blocks }`. `text` alone is enough for Teams
 * (incoming webhook) and Discord (`content` is added as an alias).
 */

export const ALERT_EVENTS = ["new_lead", "offer_hired", "payment_failed", "awaiting_assignment", "below_target", "new_signup_payment"] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];

export const alertWebhookSchema = z.object({
  id: z.string().min(1).max(40),
  url: z
    .string()
    .trim()
    .url("Enter a valid https:// URL.")
    .max(500)
    .refine((u) => u.startsWith("https://"), "Webhook URLs must use https://."),
  label: z.string().trim().max(60).default(""),
  events: z.array(z.enum(ALERT_EVENTS)).default([]),
  enabled: z.boolean().default(true),
});
export type AlertWebhook = z.infer<typeof alertWebhookSchema>;
export const alertWebhooksSchema = z.array(alertWebhookSchema).max(10, "At most 10 webhooks.");

export type AlertPayload = {
  title: string;
  lines?: string[];
  link?: string;
  linkLabel?: string;
};

const EVENT_LABEL: Record<AlertEvent, string> = {
  new_lead: "New lead",
  offer_hired: "Offer / hired",
  payment_failed: "Payment failed",
  awaiting_assignment: "Student awaiting assignment",
  below_target: "Below target",
  new_signup_payment: "New signup / payment",
};

const EMOJI: Record<AlertEvent, string> = {
  new_lead: "📥",
  offer_hired: "🎉",
  payment_failed: "⚠️",
  awaiting_assignment: "🕒",
  below_target: "📉",
  new_signup_payment: "💳",
};

/** Build the JSON body for one alert. Pure, unit-tested. */
export function buildAlertBody(event: AlertEvent, p: AlertPayload) {
  const href = p.link ? (p.link.startsWith("http") ? p.link : absoluteUrl(p.link)) : null;
  const headline = `${EMOJI[event]} ${EVENT_LABEL[event]}: ${p.title}`;
  const details = (p.lines ?? []).filter(Boolean);
  const text = [headline, ...details, href ? `${p.linkLabel ?? "Open"}: ${href}` : null].filter(Boolean).join("\n");
  const blocks: unknown[] = [{ type: "section", text: { type: "mrkdwn", text: `*${headline}*` } }];
  if (details.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: details.join("\n") } });
  if (href) blocks.push({ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: p.linkLabel ?? "Open in UpayaInd" }, url: href }] });
  return { text, content: text, blocks };
}

const TIMEOUT_MS = 5_000;

async function post(url: string, body: unknown, fetchImpl: typeof fetch) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

/** Which configured webhooks want this event. */
export async function webhooksFor(event: AlertEvent): Promise<AlertWebhook[]> {
  const all = (await getSetting("alertWebhooks")) ?? [];
  return all.filter((w): w is AlertWebhook => Boolean(w.enabled) && Array.isArray(w.events) && w.events.includes(event));
}

/**
 * Deliver an alert to every webhook subscribed to `event`. Resolves once the
 * posts settle (callers may `void` it). Never throws.
 */
export async function sendAlert(event: AlertEvent, payload: AlertPayload, opts: { fetch?: typeof fetch } = {}): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  try {
    const hooks = await webhooksFor(event);
    if (!hooks.length) return { sent, failed };
    const body = buildAlertBody(event, payload);
    await Promise.all(
      hooks.map(async (h) => {
        try {
          await post(h.url, body, opts.fetch ?? fetch);
          sent++;
        } catch (e) {
          failed++;
          console.error(`[alerts] ${event} → ${h.label || h.url.slice(0, 40)} failed`, e instanceof Error ? e.message : e);
        }
      }),
    );
  } catch (e) {
    console.error("[alerts] sendAlert failed", e);
  }
  return { sent, failed };
}

/** Settings "Send test alert": posts to one URL regardless of its event filter; throws a readable error. */
export async function sendTestAlert(url: string, actorName: string, opts: { fetch?: typeof fetch } = {}) {
  const clean = alertWebhookSchema.shape.url.parse(url);
  const body = buildAlertBody("new_lead", { title: "Test alert from UpayaInd", lines: [`Sent by ${actorName}. If you can read this, the webhook works.`], link: "/admin/settings", linkLabel: "Open settings" });
  try {
    await post(clean, body, opts.fetch ?? fetch);
  } catch (e) {
    const reason = e instanceof Error ? (e.name === "AbortError" ? "timed out after 5 s" : e.message) : "unknown error";
    throw new Error(`The webhook didn't accept the test message (${reason}).`);
  }
  return { ok: true };
}
