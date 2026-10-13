import "server-only";
import { env, integrations } from "@/env";
import type { NotificationChannel } from "./types";

/**
 * WhatsApp via the Twilio Messages REST API (DECISIONS D-133). Optional:
 * without TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM the
 * channel reports `isConfigured() === false` and `notify()` skips it.
 *
 * Only the plain-text rendering is sent (no HTML, no attachments). Twilio
 * requires an approved template outside the 24-hour session window for
 * business-initiated messages; the text here matches the notification copy so
 * the same templates can be registered in the Twilio console.
 */
const E164_RE = /^\+[1-9]\d{6,14}$/;

export function toWhatsAppAddress(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/^whatsapp:/, "").replace(/[\s()-]/g, "");
  return E164_RE.test(digits) ? `whatsapp:${digits}` : null;
}

export const whatsappChannel: NotificationChannel = {
  id: "whatsapp",
  isConfigured: () => integrations.whatsapp,
  async send({ to, text }) {
    if (!integrations.whatsapp) return { skipped: "not_configured" };
    const dest = toWhatsAppAddress(to);
    if (!dest) return { skipped: "invalid_recipient" };
    const from = toWhatsAppAddress(env.TWILIO_WHATSAPP_FROM) ?? env.TWILIO_WHATSAPP_FROM!;
    const body = new URLSearchParams({ From: from, To: dest, Body: text.slice(0, 1600) });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID!)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok) throw new Error(`WhatsApp send failed (${res.status}${json.code ? ` / Twilio ${json.code}` : ""}): ${json.message ?? "unknown error"}`);
    return { id: json.sid ?? "" };
  },
};
