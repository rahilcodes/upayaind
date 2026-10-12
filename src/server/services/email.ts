import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/render";
import ActionEmail, { type ActionEmailProps } from "@emails/action-email";
import { env, integrations } from "@/env";

const resend = integrations.email ? new Resend(env.RESEND_API_KEY) : null;

export type EmailAttachment = { filename: string; content: Buffer };

/** Outbox for tests and local development (emails are also printed). */
export const devOutbox: { to: string; subject: string; text: string; at: Date }[] = [];

/**
 * Send a transactional email (Resend + React Email). Without RESEND_API_KEY
 * (development) the message is printed to the console instead.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  content: ActionEmailProps;
  attachments?: EmailAttachment[];
  replyTo?: string;
}) {
  const element = ActionEmail(input.content);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  if (!resend) {
    devOutbox.push({ to: input.to, subject: input.subject, text, at: new Date() });
    if (devOutbox.length > 200) devOutbox.shift();
    if (env.NODE_ENV !== "test") {
      console.info(`\n✉️  [dev email] to=${input.to}\n   subject: ${input.subject}\n${text.split("\n").map((l) => `   ${l}`).join("\n")}\n`);
    }
    return { id: `dev_${Date.now()}` };
  }
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html,
    text,
    replyTo: input.replyTo,
    attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  });
  if (error) throw new Error(`Email failed: ${error.message}`);
  return { id: data?.id ?? "" };
}
