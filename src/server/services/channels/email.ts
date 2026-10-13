import "server-only";
import { integrations } from "@/env";
import { sendEmail } from "../email";
import type { NotificationChannel } from "./types";

/**
 * Email channel: wraps the existing Resend/React Email sender. "Configured" is
 * always true because development falls back to the console outbox (D-004).
 */
export const emailChannel: NotificationChannel = {
  id: "email",
  isConfigured: () => true,
  async send({ to, payload }) {
    if (!to) return { skipped: "no_recipient" };
    const { id } = await sendEmail({
      to,
      subject: payload.subject,
      attachments: payload.attachments,
      content: { preview: payload.preview ?? "", heading: payload.heading, paragraphs: payload.paragraphs, cta: payload.cta },
    });
    return { id };
  },
};

/** Exposed for the health/doctor output. */
export const emailMode = () => (integrations.email ? "resend" : "console");
