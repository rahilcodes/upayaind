import type { EmailAttachment } from "../email";

/**
 * Notification channels (SPEC F13 / P1 WhatsApp, DECISIONS D-133).
 * `notify()` renders a notification once and hands it to every channel the
 * user + template allow. A channel that isn't configured reports so through
 * `isConfigured()` and is skipped (never throws at import time).
 */
export type ChannelId = "email" | "whatsapp";

export type ChannelMessage = {
  /** Destination: email address or E.164 phone number, depending on the channel. */
  to: string;
  /** Notification type key (TEMPLATES) — for logging and per-channel overrides. */
  template: string;
  /** Rendered pieces, shared by every channel. */
  payload: {
    subject: string;
    heading: string;
    paragraphs: string[];
    cta?: { label: string; href: string };
    preview?: string;
    attachments?: EmailAttachment[];
  };
  /** Plain-text rendering (WhatsApp/SMS body; email text part fallback). */
  text: string;
};

export type ChannelResult = { id: string; skipped?: undefined } | { skipped: "not_configured" | "no_recipient" | "opted_out" | "invalid_recipient"; id?: undefined };

export interface NotificationChannel {
  readonly id: ChannelId;
  isConfigured(): boolean;
  send(message: ChannelMessage): Promise<ChannelResult>;
}
