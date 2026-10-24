import "server-only";
import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import ActionEmail, { type ActionEmailProps } from "@emails/action-email";
import { emailTransport, env } from "@/env";

/**
 * Transactional email (D-004, D-150). Transport is picked from the environment:
 * - RESEND_API_KEY            → Resend API
 * - SMTP_HOST/USER/PASS       → any SMTP mailbox (e.g. the hosting provider's
 *                               contact@ mailbox, Google Workspace, Zoho)
 * - neither (development)     → printed to the console + `devOutbox`
 * Production refuses to boot without one of the first two (env.ts) unless
 * SKIP_ENV_STRICT=1, so a misconfigured server shows up at deploy time rather
 * than as "verification emails never arrive".
 */

const resend = emailTransport === "resend" ? new Resend(env.RESEND_API_KEY) : null;

let smtp: Transporter | null = null;
function smtpTransport() {
  if (smtp) return smtp;
  const port = env.SMTP_PORT ?? 587;
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "1" : port === 465;
  smtp = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  return smtp;
}

export type EmailAttachment = { filename: string; content: Buffer };

/** Outbox for tests and local development (emails are also printed). */
export const devOutbox: { to: string; subject: string; text: string; at: Date }[] = [];

/** Send a transactional email (React Email template → HTML + plain text). */
export async function sendEmail(input: {
  to: string;
  subject: string;
  content: ActionEmailProps;
  attachments?: EmailAttachment[];
  replyTo?: string;
}) {
  const element = ActionEmail(input.content);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  if (resend) {
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

  if (emailTransport === "smtp") {
    try {
      const info = await smtpTransport().sendMail({
        from: env.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html,
        text,
        replyTo: input.replyTo,
        attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
      });
      return { id: info.messageId ?? "" };
    } catch (e) {
      throw new Error(`Email failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  devOutbox.push({ to: input.to, subject: input.subject, text, at: new Date() });
  if (devOutbox.length > 200) devOutbox.shift();
  if (env.NODE_ENV !== "test") {
    console.info(`\n✉️  [dev email] to=${input.to}\n   subject: ${input.subject}\n${text.split("\n").map((l) => `   ${l}`).join("\n")}\n`);
  }
  return { id: `dev_${Date.now()}` };
}

/** Verify the SMTP connection (used by the health check / admin warning). Resend and console report ok. */
export async function verifyEmailTransport(): Promise<{ transport: typeof emailTransport; ok: boolean; error?: string }> {
  if (emailTransport !== "smtp") return { transport: emailTransport, ok: true };
  try {
    await smtpTransport().verify();
    return { transport: "smtp", ok: true };
  } catch (e) {
    return { transport: "smtp", ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
