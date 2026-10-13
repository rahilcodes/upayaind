import "server-only";
import { emailChannel } from "./email";
import { whatsappChannel } from "./whatsapp-twilio";
import type { ChannelId, NotificationChannel } from "./types";

export type { ChannelId, ChannelMessage, ChannelResult, NotificationChannel } from "./types";
export { emailChannel } from "./email";
export { whatsappChannel, toWhatsAppAddress } from "./whatsapp-twilio";

export const CHANNELS: Record<ChannelId, NotificationChannel> = { email: emailChannel, whatsapp: whatsappChannel };

/** Build the plain-text body shared by WhatsApp and the email text part. */
export function renderPlainText(m: { heading: string; paragraphs: string[]; cta?: { label: string; href: string } }) {
  const lines = [m.heading, "", ...m.paragraphs];
  if (m.cta) lines.push("", `${m.cta.label}: ${m.cta.href}`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
